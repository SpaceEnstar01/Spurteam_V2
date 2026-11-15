#!/usr/bin/env python3
"""Real Linux render smoke using a plan already authored by DSH; no model keys."""
import argparse,json,pathlib,subprocess,uuid,os
p=argparse.ArgumentParser();p.add_argument('--tts-proxy',default='');p.add_argument('--image',default='spur-agent:openmontage-v1');a=p.parse_args()
v2=pathlib.Path(__file__).resolve().parents[3]
source=v2/'docs/DSH自主调用OpenMontage生成八秒视频并完成网页交付验证-2026年11月09日/video-job.json'
old=json.loads(source.read_text());jid=str(uuid.uuid4());work=pathlib.Path('/tmp')/('spur-openmontage-linux-'+jid);work.mkdir(mode=0o700);work.chmod(0o777)
job=work/(jid+'.json');job.write_text(json.dumps({'id':jid,'provider':'openmontage','plan':old['plan']},ensure_ascii=False));job.chmod(0o644)
# Use the image runtime UID; this disposable bind contains only the non-secret test plan and generated media.
cmd=['docker','run','--rm','--platform','linux/amd64','--user','10001:10001','--shm-size=1g','--memory=4g','--cpus=2','--env','HOME=/tmp','--env','SPUR_TTS_PROXY='+a.tts_proxy,'--mount','type=bind,src='+str(work)+',dst=/validation','--entrypoint','/opt/openmontage-venv/bin/python',a.image,'/opt/spur/V2/agent/tools/openmontage/render.py','/validation/'+job.name]
print('TEST_DIRECTORY='+str(work),flush=True)
with (work/'render.log').open('w') as log:
 result=subprocess.run(cmd,stdout=log,stderr=subprocess.STDOUT)
if result.returncode:
 print('LINUX_RENDER_NOT_PASSED');print('日志：'+str(work/'render.log'));print((work/'render.log').read_text()[-3500:]);raise SystemExit(result.returncode)
output=work/(jid+'.rendered.mp4')
if not output.is_file() or output.stat().st_size<10000:raise SystemExit('LINUX_RENDER_NOT_PASSED: missing MP4')
report=work/'openmontage-projects'/('video-'+jid)/'artifacts/render_report.json'
data=json.loads(report.read_text());assert data['metadata']['full_decode_passed']
print('LINUX_OPENMONTAGE_RENDER_PASS');print('VIDEO='+str(output));print('DURATION=8 RESOLUTION=1080x1920 FULL_DECODE=true')
