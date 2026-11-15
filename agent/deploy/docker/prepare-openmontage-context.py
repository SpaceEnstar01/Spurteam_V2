#!/usr/bin/env python3
"""Build an allowlisted context; never copies env files, sessions, or finished videos."""
import argparse,json,pathlib,shutil,subprocess,hashlib
p=argparse.ArgumentParser();p.add_argument('--output',type=pathlib.Path,default=pathlib.Path('/tmp/spur-openmontage-cloud-v1'));a=p.parse_args()
v2=pathlib.Path(__file__).resolve().parents[3];dst=a.output.resolve()
if dst.exists():raise SystemExit('目标目录已存在，请指定新的 --output，不覆盖旧构建上下文。')
root=v2/'agent/runtime/OpenMontage-main';base=v2/'docs/OpenMontage阿尔卑斯山十五条记录制作六十秒旅行视频验证-2026年11月09日'
venv=pathlib.Path.home()/'.local/share/spur/openmontage-validation/venv/bin/python'
if not venv.is_file():raise SystemExit('缺少已验证的Python环境')
subprocess.run(['npm','run','build'],cwd=v2/'web',check=True)
dst.mkdir(parents=True)
def copy(src,target):
 target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(src,target)
# Explicit source roots and data extensions only; do not walk personal project outputs.
for folder in ['lib','tools','schemas','pipeline_defs','skills']:
 for src in (root/folder).rglob('*'):
  if src.is_file() and not src.is_symlink() and '__pycache__' not in src.parts and src.suffix in {'.py','.json','.yaml','.yml','.md'}:
   copy(src,dst/'OpenMontage'/src.relative_to(root))
for name in ['LICENSE','README.md','AGENT_GUIDE.md','PROJECT_CONTEXT.md','config.yaml']:
 copy(root/name,dst/'OpenMontage'/name)
composer=root/'remotion-composer'
for src in (composer/'src').rglob('*'):
 if src.is_file() and not src.is_symlink():copy(src,dst/'OpenMontage/remotion-composer'/src.relative_to(composer))
for name in ['package.json','package-lock.json','tsconfig.json']:copy(composer/name,dst/'OpenMontage/remotion-composer'/name)
for folder in ['openmontage','video-generation']:
 for src in (v2/'agent/tools'/folder).iterdir():
  if src.is_file() and src.suffix in {'.py','.cjs','.md'}:copy(src,dst/'tools'/folder/src.name)
for src in (v2/'web').glob('*.mjs'):copy(src,dst/'web'/src.name)
for folder in ['email','dist']:
 for src in (v2/'web'/folder).rglob('*'):
  if src.is_file() and not src.is_symlink():copy(src,dst/'web'/src.relative_to(v2/'web'))
# Pin the minimal Python dependencies to versions actually installed and tested.
code="import importlib.metadata,json;print(json.dumps({n:importlib.metadata.version(n) for n in ['edge-tts','PyYAML','jsonschema','python-dotenv','requests','Pillow','pydantic']}))"
versions=json.loads(subprocess.check_output([str(venv),'-c',code],universal_newlines=True))
(dst/'requirements.lock').write_text(''.join(n+'=='+v+'\n' for n,v in versions.items()))
shots=json.loads((base/'shot-plan.json').read_text())['shots'];assets=json.loads((base/'projects/alps-finding-my-own-pace/artifacts/asset_manifest.json').read_text())['assets'];by={x['id']:x for x in assets};clips=[]
for shot in shots:
 if shot['duration']<4 or shot['id']=='08':continue
 source=base/'shots'/pathlib.Path(shot['path']).name;copy(source,dst/'media/shots'/source.name)
 clips.append({'id':shot['id'],'path':'/opt/spur/openmontage-media/shots/'+source.name,'description':shot['reason'],'license':by[shot['id']]['license'],'original_url':by[shot['id']]['original_url']})
copy(base/'music-original.wav',dst/'media/music-original.wav');copy(base/'素材来源与署名.md',dst/'media/素材来源与署名.md')
(dst/'media/catalog.json').write_text(json.dumps({'clips':clips,'music':'/opt/spur/openmontage-media/music-original.wav','attribution_file':'/opt/spur/openmontage-media/素材来源与署名.md'},ensure_ascii=False,indent=2))
copy(pathlib.Path(__file__).with_name('OpenMontage.Dockerfile'),dst/'Dockerfile')
manifest={str(f.relative_to(dst)):hashlib.sha256(f.read_bytes()).hexdigest() for f in dst.rglob('*') if f.is_file()}
(dst/'build-manifest.json').write_text(json.dumps(manifest,indent=2))
print('OPENMONTAGE_BUILD_CONTEXT_READY='+str(dst));print('SOURCE_CLIPS='+str(len(clips)));print('NO_KEYS_OR_PERSONAL_SESSIONS_COPIED')
