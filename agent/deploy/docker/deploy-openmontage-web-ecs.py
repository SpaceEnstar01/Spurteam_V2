#!/usr/bin/env python3
"""Python 3.6: upgrade Web guest workers only, preserving volumes/grants/rollback."""
import json,os,subprocess,sys,time,shutil,hashlib
from pathlib import Path
from datetime import datetime
BASE=Path('/root/spur-web-guests');STAGE=BASE/'openmontage-v1';GATE='spur-web-guest-gateway';IMAGE='spur-agent:openmontage-v1'
NAMES=['spur-web-guest-worker-'+str(i) for i in range(1,16)]
SERVER='/opt/spur/V2/web/server.mjs';LOCK='/opt/spur/render-lock'
def run(args,timeout=90):
 p=subprocess.run(args,stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True,timeout=timeout)
 if p.returncode:raise RuntimeError('Operation failed: '+args[0]+' '+args[1])
 return p.stdout

def inspect(name):return json.loads(run(['docker','inspect',name]))[0]
def private_json(path,value):
 fd=os.open(str(path),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as f:json.dump(value,f)
def probe(name,script,timeout=12):return subprocess.run(['docker','exec',name,'node','-e',script],stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True,timeout=timeout).returncode==0
def healthy(name):
 for _ in range(25):
  if probe(name,'fetch("http://127.0.0.1:4173/api/creator-agent/health",{headers:{Authorization:"Bearer "+process.env.SPUR_CREATOR_AGENT_TOKEN},signal:AbortSignal.timeout(3000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'):return True
  time.sleep(1)
 return False

def idle(name):
 script='const f=require("fs"),p="/opt/spur/V2/web/.runtime/";if(f.existsSync(p+"runs"))for(const n of f.readdirSync(p+"runs")){const q=p+"runs/"+n+"/task.json";if(f.existsSync(q)&&JSON.parse(f.readFileSync(q)).status==="running")process.exit(2)}if(f.existsSync(p+"video-jobs"))for(const n of f.readdirSync(p+"video-jobs")){if(!n.endsWith(".json"))continue;const j=JSON.parse(f.readFileSync(p+"video-jobs/"+n));if(["submitting","queued","generating","downloading"].includes(j.status))process.exit(2)}'
 if not probe(name,script):raise RuntimeError('Active or unverifiable task: '+name+'; wait for completion, do not force stop')
def queue_idle():
 file=BASE/'data/queue.json'
 if file.exists() and any(j.get('phase') in ['queued','dispatching','running'] for j in json.loads(file.read_text())):raise RuntimeError('Guest queue has active/pending tasks; wait before upgrade')
def args_for(info,name,env_file):
 h=info['HostConfig'];ports=(h.get('PortBindings') or {}).get('4173/tcp') or []
 if not h.get('ReadonlyRootfs') or info['Config'].get('User') not in ['10001:10001','10001']:raise RuntimeError('Unexpected guest isolation')
 if len(ports)!=1 or ports[0]['HostIp']!='127.0.0.1' or h.get('NetworkMode')=='host':raise RuntimeError('Unexpected guest networking')
 args=['docker','run','-d','--name',name,'--restart','unless-stopped','--platform','linux/amd64','--read-only','--init','--cap-drop','ALL','--security-opt','no-new-privileges:true','--security-opt','seccomp=/root/seccomp-playwright.json','--memory','4g','--cpus','2','--pids-limit','512','--shm-size','1g','--env-file',str(env_file),'-p','127.0.0.1:'+str(ports[0]['HostPort'])+':4173']
 for dest,opts in (h.get('Tmpfs') or {}).items():
  if dest=='/tmp':opts='rw,nosuid,nodev,mode=1777,size=768m'
  args+=['--tmpfs',dest+':'+opts]
 if '/tmp' not in (h.get('Tmpfs') or {}):raise RuntimeError('Missing tmpfs')
 volumes=0
 allowed={SERVER,'/opt/spur/V2/web/app-connections.mjs','/opt/spur/V2/agent/tools/connectors/youtube','/opt/spur/guest-node'}
 for m in info['Mounts']:
  if m['Type']=='tmpfs':continue
  dest=m['Destination']
  if dest==SERVER:continue
  if m['Type']=='volume' and dest=='/opt/spur/V2/web/.runtime' and m['Name'].startswith('spur-web-guest-'):
   volumes+=1;args+=['--mount','type=volume,src='+m['Name']+',dst='+dest]
  elif m['Type']=='bind' and dest in allowed and not m['RW']:args+=['--mount','type=bind,src='+m['Source']+',dst='+dest+',readonly']
  else:raise RuntimeError('Unexpected mount: '+name+' '+dest)
 if volumes!=1:raise RuntimeError('Expected one private guest volume')
 args+=['--mount','type=bind,src='+str(STAGE/'server.mjs')+',dst='+SERVER+',readonly','--mount','type=bind,src='+str(STAGE/'worker.cjs')+',dst=/opt/spur/V2/agent/tools/openmontage/worker.cjs,readonly','--mount','type=bind,src='+str(BASE/'render-lock')+',dst='+LOCK,IMAGE]
 return args

def write_env(info,path):
 env=dict(x.split('=',1) for x in info['Config']['Env'] if '=' in x)
 env.update({'SPUR_OPENMONTAGE_ENABLED':'1','SPUR_OPENMONTAGE_LOCK_FILE':LOCK+'/render.lock','SPUR_OPENMONTAGE_ROOT':'/opt/spur/V2/agent/runtime/OpenMontage-main','SPUR_OPENMONTAGE_PYTHON':'/opt/openmontage-venv/bin/python','SPUR_OPENMONTAGE_CATALOG':'/opt/spur/openmontage-media/catalog.json','SPUR_RENDER_CHROME':'/usr/bin/google-chrome','SPUR_FFMPEG':'/usr/bin/ffmpeg','SPUR_FFPROBE':'/usr/bin/ffprobe','SPUR_TTS_PROXY':''})
 fd=os.open(str(path),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as f:
  for k,v in env.items():
   if '\n' in v or '\r' in v:raise RuntimeError('Unsupported environment')
   f.write(k+'='+v+'\n')

def rollback(backup):
 state=json.loads((backup/'state.json').read_text());failed=[]
 subprocess.run(['docker','stop',GATE],stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 try:
  for item in reversed(state['workers']):
   name,old=item['name'],item['backup'];names=run(['docker','ps','-a','--format','{{.Names}}']).splitlines()
   if old not in names:
    if name in names:
     run(['docker','start',name])
     if not healthy(name):failed.append(name)
    else:failed.append(name)
    continue
   if name in names:run(['docker','rm','-f',name])
   run(['docker','rename',old,name]);run(['docker','start',name])
   if not healthy(name):failed.append(name)
  if (backup/'dist').exists():
   if (BASE/'release/dist').exists():shutil.rmtree(str(BASE/'release/dist'))
   shutil.copytree(str(backup/'dist'),str(BASE/'release/dist'))
 finally:run(['docker','start',GATE])
 if failed:raise RuntimeError('Rollback health not confirmed: '+','.join(failed))
 for attempt in range(20):
  if probe(GATE,'const h=require("http");h.get({host:"127.0.0.1",port:4190,path:"/healthz",headers:{Host:"ai.hispurring.com"}},r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on("error",()=>process.exit(1))'):break
  time.sleep(1)
 else:raise RuntimeError('Rollback gateway health not confirmed')
 print('OPENMONTAGE_WEB_ROLLBACK_READY')

def apply():
 # Check the same allowlisted source fingerprints without executing canary CLI code.
 for name,digest in json.loads((STAGE/'original-sha.json').read_text()).items():
  if hashlib.sha256((BASE/name).read_bytes()).hexdigest()!=digest:raise RuntimeError('Live source changed; stop and re-check')
 for name,digest in json.loads((STAGE/'manifest.json').read_text()).items():
  if hashlib.sha256((STAGE/name).read_bytes()).hexdigest()!=digest:raise RuntimeError('Staged package changed')
 if not (BASE/'render-lock/render.lock').is_file():raise RuntimeError('Shared render lock missing')
 if not probe('spur-openmontage-web-canary','const f=require("fs"),p="/opt/spur/V2/web/.runtime/video-jobs";const j=f.readdirSync(p).filter(n=>n.endsWith(".json")).map(n=>JSON.parse(f.readFileSync(p+"/"+n)));if(j.filter(x=>x.status==="completed").length<2)process.exit(2)'):raise RuntimeError('Canary completion evidence missing')
 infos={name:inspect(name) for name in NAMES}
 if any(dict(x.split('=',1) for x in i['Config']['Env'] if '=' in x).get('SPUR_OPENMONTAGE_ENABLED')=='1' for i in infos.values()):raise RuntimeError('Already or partially upgraded; do not apply again')
 if any(not i['State']['Running'] for i in infos.values()):raise RuntimeError('Guest worker is not running')
 queue_idle()
 for name in NAMES:idle(name)
 stamp=datetime.now().strftime('%Y%m%d-%H%M%S');backup=BASE/('before-openmontage-'+stamp);backup.mkdir(mode=0o700)
 state={'workers':[]};private_json(backup/'state.json',state)
 for name in NAMES:
  private_json(backup/(name+'.inspect.json'),infos[name]);write_env(infos[name],backup/(name+'.env'));args_for(infos[name],name,backup/(name+'.env'))
 # Stop only the guest gateway so no new task enters during the brief switch.
 run(['docker','stop',GATE]);started=False
 try:
  queue_idle()
  for name in NAMES:idle(name)
  shutil.copytree(str(BASE/'release/dist'),str(backup/'dist'))
  for name in NAMES:
   old=name+'-before-montage-'+stamp;state['workers'].append({'name':name,'backup':old})
   (backup/'state.json').write_text(json.dumps(state));os.chmod(str(backup/'state.json'),0o600)
   run(['docker','stop',name]);run(['docker','rename',name,old]);run(args_for(infos[name],name,backup/(name+'.env')))
   if not healthy(name):raise RuntimeError('New guest worker health failed: '+name)
   print(name+': OPENMONTAGE_READY',flush=True)
  shutil.rmtree(str(BASE/'release/dist'));shutil.copytree(str(STAGE/'dist'),str(BASE/'release/dist'))
  run(['docker','start',GATE]);started=True
  # Guest gateway loopback health; never include registry tokens in output.
  probe_script='const h=require("http");h.get({host:"127.0.0.1",port:4190,path:"/healthz",headers:{Host:"ai.hispurring.com"}},r=>{r.resume();process.exit(r.statusCode===200?0:1)}).on("error",()=>process.exit(1))'
  for attempt in range(20):
   if probe(GATE,probe_script):break
   time.sleep(1)
  else:raise RuntimeError('Guest gateway health failed')
  for name in NAMES:
   if not probe(name,'if(process.env.SPUR_OPENMONTAGE_ENABLED!=="1"||process.env.SPUR_OPENMONTAGE_LOCK_FILE!=="/opt/spur/render-lock/render.lock")process.exit(2)'):raise RuntimeError('Worker feature configuration mismatch')
 except Exception:
  print('UPGRADE_FAILED; attempting rollback',flush=True);rollback(backup);raise
 print('OPENMONTAGE_WEB_SWITCH_READY');print('BACKUP='+str(backup));print('15 private visitors preserved; Agent concurrency 2; global video render concurrency 1.');print('Public browser production task acceptance is still required.')

try:
 if os.geteuid()!=0:raise RuntimeError('Run on ECS as root')
 if sys.argv[1:]==['--apply']:apply()
 elif len(sys.argv)==3 and sys.argv[1]=='--rollback':
  b=Path(sys.argv[2]).resolve()
  if b.parent!=BASE or not b.name.startswith('before-openmontage-'):raise RuntimeError('Invalid backup')
  rollback(b)
 else:raise RuntimeError('Use --apply, or --rollback <printed-backup-path>')
except Exception as e:
 print('OPENMONTAGE_WEB_STOPPED: '+str(e),file=sys.stderr);sys.exit(1)
