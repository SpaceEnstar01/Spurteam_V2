#!/usr/bin/env python3
"""Retry only rendering with cached audio/plan, one Chrome page, 4 GiB memory."""
import argparse,pathlib,subprocess
p=argparse.ArgumentParser();p.add_argument('directory',type=pathlib.Path);p.add_argument('--read-only',action='store_true');a=p.parse_args();work=a.directory.resolve()
if not work.is_dir() or not work.name.startswith('spur-openmontage-linux-'):raise SystemExit('无效测试目录')
if len(list(work.glob('openmontage-projects/*/artifacts/render_props.json')))!=1:raise SystemExit('缺少唯一的缓存分镜')
code=r'''
import sys,pathlib,json,dataclasses,subprocess
sys.path.insert(0,'/opt/spur/V2/agent/runtime/OpenMontage-main')
from tools.video.video_compose import VideoCompose
root=pathlib.Path('/validation');art=next(root.glob('openmontage-projects/*/artifacts/render_props.json')).parent
props=json.loads((art/'render_props.json').read_text());assets=json.loads((art/'asset_manifest.json').read_text());out=root/'retry-single-page';out.mkdir(exist_ok=True)
r=VideoCompose().execute({'operation':'render','edit_decisions':props,'asset_manifest':assets,'proposal_packet':{'production_plan':{'render_runtime':'remotion','renderer_family':'documentary-montage'}},'output_path':str(out/'render.mp4'),'profile':'youtube_shorts','remotion_concurrency':1,'remotion_timeout_ms':180000,'remotion_browser_executable':'/usr/bin/google-chrome'})
(out/'tool-result.json').write_text(json.dumps(dataclasses.asdict(r),ensure_ascii=False,indent=2))
if not r.success:raise RuntimeError(r.error)
final=out/'final-8s.mp4'
subprocess.run(['ffmpeg','-v','error','-y','-i',str(out/'render.mp4'),'-t','8','-c:v','copy','-c:a','aac','-movflags','+faststart',str(final)],check=True)
d=json.loads(subprocess.check_output(['ffprobe','-v','error','-show_streams','-show_format','-of','json',str(final)]));v=next(x for x in d['streams'] if x['codec_type']=='video')
assert abs(float(d['format']['duration'])-8)<.05 and (v['width'],v['height'])==(1080,1920)
assert any(x['codec_type']=='audio' for x in d['streams'])
subprocess.run(['ffmpeg','-v','error','-i',str(final),'-f','null','-'],check=True)
(out/'verification.json').write_text(json.dumps(d,indent=2));print('LINUX_OPENMONTAGE_RENDER_PASS',flush=True)
'''
cmd=['docker','run','--rm','--platform','linux/amd64','--user','10001:10001','--shm-size=1g','--memory=4g','--cpus=2','-e','HOME=/tmp','--mount','type=bind,src='+str(work)+',dst=/validation','--entrypoint','/opt/openmontage-venv/bin/python','spur-agent:openmontage-v1','-c',code]
if a.read_only:cmd[2:2]=['--read-only','--cap-drop=ALL','--security-opt=no-new-privileges:true','--tmpfs','/tmp:rw,mode=1777,size=768m']
log=work/'retry-single-page.log';print('RETRY_LOG='+str(log),flush=True)
with log.open('w') as f:r=subprocess.run(cmd,stdout=f,stderr=subprocess.STDOUT)
if r.returncode:print(log.read_text()[-3500:]);raise SystemExit(r.returncode)
print('LINUX_OPENMONTAGE_RENDER_PASS');print('VIDEO='+str(work/'retry-single-page/final-8s.mp4'))
