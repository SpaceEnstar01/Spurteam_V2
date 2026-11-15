#!/usr/bin/env python3
"""Python 3.6 compatible. Separate canary only; no Caddy/gateway/personal changes."""
import json,os,subprocess,sys,time,secrets,hashlib
from pathlib import Path
BASE=Path('/root/spur-web-guests');STAGE=BASE/'openmontage-v1';NAME='spur-openmontage-web-canary';IMAGE='spur-agent:openmontage-v1';VOLUME='spur-openmontage-web-canary-data'
def run(args,data=None,timeout=90):
 p=subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE,universal_newlines=True,timeout=timeout)
 if p.returncode:raise RuntimeError('Command failed: '+args[0]+' '+args[1])
 return p.stdout

def verify():
 manifest=json.loads((STAGE/'manifest.json').read_text())
 for name,digest in manifest.items():
  p=STAGE/name
  if '..' in Path(name).parts or Path(name).is_absolute() or p.is_symlink() or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:raise RuntimeError('Package integrity mismatch')
 expected=json.loads((STAGE/'original-sha.json').read_text())
 for name,digest in expected.items():
  if hashlib.sha256((BASE/name).read_bytes()).hexdigest()!=digest:raise RuntimeError('Live source changed; re-check before continuing')

def create():
 verify()
 old=json.loads(run(['docker','inspect','spur-web-guest-worker-1']))[0]
 if NAME in run(['docker','ps','-a','--format','{{.Names}}']).splitlines():raise RuntimeError('Canary already exists; use --verify')
 image=json.loads(run(['docker','image','inspect',IMAGE]))[0]
 if image['Architecture']!='amd64':raise RuntimeError('Wrong image platform')
 if not Path('/root/seccomp-playwright.json').is_file():raise RuntimeError('Verified seccomp file missing')
 source=dict(x.split('=',1) for x in old['Config']['Env'] if '=' in x)
 env={k:source[k] for k in ['SILICONFLOW_API_KEY','SILICONFLOW_BASE_URL','SPUR_CHAT_MODEL','SPUR_NODE_BIN'] if source.get(k)}
 if not env.get('SILICONFLOW_API_KEY'):raise RuntimeError('Guest model key missing')
 env.update({'SPUR_CONFIG_FILE':'/nonexistent/guest.env','SPUR_RUNTIME_ROOT':'/opt/spur/V2/web/.runtime','SPUR_CREATOR_AGENT_TOKEN':secrets.token_urlsafe(32),'SPUR_AGENTMAIL_AUTOSUMMARY':'0','SPUR_RESEARCH_ADAPTER_ENABLED':'0','SPUR_OPENMONTAGE_ENABLED':'1','SPUR_OPENMONTAGE_LOCK_FILE':'/opt/spur/render-lock/render.lock','SPUR_TTS_PROXY':'','YOUTUBE_API_KEY':'','NOTION_TOKEN':'','SPUR_IMAGE_MODEL':'','SPUR_VIDEO_T2V_MODEL':''})
 lock=BASE/'render-lock';lock.mkdir(exist_ok=True);os.chown(str(lock),10001,10001);os.chmod(str(lock),0o700)
 fd=os.open(str(lock/'render.lock'),os.O_CREAT|os.O_RDWR,0o600);os.fchown(fd,10001,10001);os.close(fd)
 private=BASE/'openmontage-canary-private.env';fd=os.open(str(private),os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
 with os.fdopen(fd,'w') as f:
  for k,v in env.items():
   if '\n' in v or '\r' in v:raise RuntimeError('Unsupported environment')
   f.write(k+'='+v+'\n')
 run(['docker','volume','create',VOLUME])
 run(['docker','run','--rm','--user','0:0','--network','none','--mount','type=volume,src='+VOLUME+',dst=/guest-data','--entrypoint','sh',IMAGE,'-c','chown 10001:10001 /guest-data && chmod 700 /guest-data'])
 args=['docker','run','-d','--name',NAME,'--platform','linux/amd64','--read-only','--init','--cap-drop','ALL','--security-opt','no-new-privileges:true','--security-opt','seccomp=/root/seccomp-playwright.json','--memory','4g','--cpus','2','--pids-limit','512','--shm-size','1g','--env-file',str(private),'--tmpfs','/home/spur:rw,uid=10001,gid=10001,mode=0700,size=128m','--tmpfs','/tmp:rw,nosuid,nodev,mode=1777,size=768m','--mount','type=volume,src='+VOLUME+',dst=/opt/spur/V2/web/.runtime','--mount','type=bind,src='+str(lock)+',dst=/opt/spur/render-lock','--mount','type=bind,src='+str(STAGE/'server.mjs')+',dst=/opt/spur/V2/web/server.mjs,readonly','--mount','type=bind,src='+str(STAGE/'worker.cjs')+',dst=/opt/spur/V2/agent/tools/openmontage/worker.cjs,readonly','-p','127.0.0.1:4390:4173']
 allowed={'/opt/spur/V2/web/app-connections.mjs','/opt/spur/V2/agent/tools/connectors/youtube','/opt/spur/guest-node'}
 for m in old['Mounts']:
  if m['Destination'] in allowed:
   if m['Type']!='bind' or m['RW']:raise RuntimeError('Unexpected writable source mount')
   args+=['--mount','type=bind,src='+m['Source']+',dst='+m['Destination']+',readonly']
 args.append(IMAGE);run(args)
 print('OPENMONTAGE_CANARY_CREATED')
 print('Separate volume and token; production workers and gateway unchanged.')

JS=r'''
(async()=>{
const fs=require('fs'),crypto=require('crypto'),assert=require('assert/strict');
const root='http://127.0.0.1:4173/api/creator-agent',headers={Authorization:'Bearer '+process.env.SPUR_CREATOR_AGENT_TOKEN,'Content-Type':'application/json'};
async function get(path,options={}){const r=await fetch(root+path,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(10000)});return {r,data:await r.json()}}
for(let i=0;i<25;i++){try{const h=await get('/health');if(h.r.ok)break}catch{}await new Promise(r=>setTimeout(r,1000))}
const input=JSON.parse(fs.readFileSync('/opt/spur/openmontage-smoke-job.json','utf8'));
// Simulate another tenant owning the shared render slot; the job must queue.
const {spawn}=require('child_process');const holder=spawn('/usr/bin/flock',['--no-fork',process.env.SPUR_OPENMONTAGE_LOCK_FILE,'sh','-c','echo LOCKED; sleep 12']);
await new Promise((resolve,reject)=>{holder.stdout.once('data',resolve);holder.once('error',reject)});
const job={id:crypto.randomUUID(),runId:crypto.randomUUID(),provider:'openmontage',status:'queued',createdAt:new Date().toISOString(),plan:input.plan};
const jobs=require('/opt/spur/V2/agent/tools/video-generation/jobs.cjs'),dir='/opt/spur/V2/web/.runtime/video-jobs';jobs.writeJob(dir,job);
await new Promise(r=>setTimeout(r,4500));let check=jobs.readJob(dir,job.id);assert.equal(check.status,'queued');assert.match(check.phase,/等待其他视频/);console.log('GLOBAL_RENDER_LOCK_QUEUE_PASS');
for(let i=0;i<180;i++){await new Promise(r=>setTimeout(r,2000));check=jobs.readJob(dir,job.id);if(check.status==='failed')throw Error(check.error);if(check.status==='completed')break}
assert.equal(check.status,'completed');const range=await fetch(root+'/videos/'+job.id+'/file',{headers:{...headers,Range:'bytes=0-1023'}});assert.equal(range.status,206);assert.equal((await range.arrayBuffer()).byteLength,1024);console.log('READONLY_CONTAINER_RENDER_AND_RANGE_PASS');
// Actual DSH, same backend API as website. Do not ask it to reuse the smoke movie.
const id=crypto.randomUUID(),message='请使用montage_assets和montage_generate，为以下日常记录制作一条新的8秒9:16英文徒步短片，Sonia女声、音乐、英文字幕，自己写两句每句最多10词的旁白并选两个分镜。记录：清晨冷得想退缩；碎石路难走；三个小时后腿酸想放弃；老人说慢慢走；放下手机听牛铃；云开看见整个山谷；终于走过最难一段；回到小镇后发现收获是找回自己的节奏。不要使用已经完成的视频，不需要确认。';
const submitted=await get('/chat',{method:'POST',body:JSON.stringify({requestId:id,message,async:true})});assert.equal(submitted.r.status,202);console.log('DSH_SUBMIT_HTTP=202');
let task;for(let i=0;i<180;i++){await new Promise(r=>setTimeout(r,2000));task=(await get('/tasks/'+id)).data;if(task.status==='failed')throw Error(task.error);if(task.status==='finished')break}
assert.equal(task.status,'finished');const video=task.result.videoJobs.find(j=>j.provider==='openmontage');assert.ok(video,'DSH did not submit OpenMontage job');console.log('DSH_TOOL_CALL_PASS');
for(let i=0;i<180;i++){await new Promise(r=>setTimeout(r,2000));check=(await get('/videos/'+video.id)).data;if(check.status==='failed')throw Error(check.error);if(check.status==='completed')break}
assert.equal(check.status,'completed');console.log('OPENMONTAGE_CANARY_END_TO_END_PASS');console.log('TASK_ID='+id);console.log('VIDEO_ID='+video.id);
})().catch(e=>{console.error(String(e.message).slice(0,1000));process.exitCode=1});
'''
def smoke():
 verify()
 # Copy only the non-secret DSH-authored fixture through stdin.
 run(['docker','exec','-i',NAME,'node','-e','let s="";process.stdin.on("data",x=>s+=x);process.stdin.on("end",()=>require("fs").writeFileSync("/opt/spur/V2/web/.runtime/smoke-job.json",s))'],(STAGE/'smoke-job.json').read_text())
 script=JS.replace('/opt/spur/openmontage-smoke-job.json','/opt/spur/V2/web/.runtime/smoke-job.json')
 p=subprocess.run(['docker','exec','-i',NAME,'node','-'],input=script,universal_newlines=True,timeout=1000)
 if p.returncode:raise RuntimeError('Canary verification failed; do not upgrade production')
 print('PRODUCTION_NOT_CHANGED')
try:
 if os.geteuid()!=0:raise RuntimeError('Run on ECS as root')
 if sys.argv[1:]==['--create']:create()
 elif sys.argv[1:]==['--verify']:smoke()
 else:raise RuntimeError('Use --create then --verify')
except Exception as e:
 print('OPENMONTAGE_CANARY_STOPPED: '+str(e),file=sys.stderr);sys.exit(1)
