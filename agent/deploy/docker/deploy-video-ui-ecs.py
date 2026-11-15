#!/usr/bin/env python3
"""Static files only. Python 3.6, no container restarts or credential changes."""
import hashlib,json,os,re,shutil,sys,time,urllib.request
from pathlib import Path
from datetime import datetime
BASE=Path('/root/spur-web-guests');STAGE=BASE/'video-ui-v1';LIVE=BASE/'release/dist'
def fetch(url):
 with urllib.request.urlopen(url,timeout=15) as r:return r.status,r.read()
def main():
 if sys.argv[1:]!=['--apply'] or os.geteuid()!=0:raise RuntimeError('Run on ECS as root with --apply')
 manifest=json.loads((STAGE/'manifest.json').read_text())
 for name,digest in manifest.items():
  p=STAGE/name
  if Path(name).is_absolute() or '..' in Path(name).parts or p.is_symlink() or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:raise RuntimeError('Package verification failed')
 if not LIVE.is_dir() or LIVE.is_symlink() or not (LIVE/'index.html').is_file():raise RuntimeError('Unexpected live web directory')
 html=(STAGE/'dist/index.html').read_text();assets=re.findall(r'(?:src|href)="(/assets/[^"<>]+)"',html)
 if len(assets)<2:raise RuntimeError('Build assets missing')
 status,data=fetch('https://ai.hispurring.com/healthz')
 if status!=200 or json.loads(data).get('status')!='ready':raise RuntimeError('Guest gateway not ready; stopped before changes')
 stamp=datetime.now().strftime('%Y%m%d-%H%M%S');backup=BASE/('before-video-ui-'+stamp);backup.mkdir(mode=0o700)
 shutil.copy2(str(LIVE/'index.html'),str(backup/'index.html'))
 changed=False
 try:
  # Content-hashed assets first; old assets are retained for already-open pages.
  for rel in assets:
   name=rel.lstrip('/');source=STAGE/'dist'/name;target=LIVE/name
   if source.is_symlink() or not source.is_file():raise RuntimeError('Invalid asset')
   target.parent.mkdir(parents=True,exist_ok=True)
   if target.exists():
    if hashlib.sha256(target.read_bytes()).digest()!=hashlib.sha256(source.read_bytes()).digest():raise RuntimeError('Existing hashed asset has different contents')
   else:
    tmp=target.with_name(target.name+'.video-ui-tmp');shutil.copyfile(str(source),str(tmp));os.chmod(str(tmp),0o644);os.replace(str(tmp),str(target))
  tmp=LIVE/'index.html.video-ui-tmp';shutil.copyfile(str(STAGE/'dist/index.html'),str(tmp));os.chmod(str(tmp),0o644);os.replace(str(tmp),str(LIVE/'index.html'));changed=True
  _,public=fetch('https://ai.hispurring.com/')
  for rel in assets:
   if rel.encode() not in public:raise RuntimeError('Public page does not reference the new assets')
   status,content=fetch('https://ai.hispurring.com'+rel)
   if status!=200 or hashlib.sha256(content).digest()!=hashlib.sha256((STAGE/'dist'/rel.lstrip('/')).read_bytes()).digest():raise RuntimeError('Public asset mismatch')
  print('VIDEO_UI_PUBLIC_ASSETS_VERIFIED')
 except Exception:
  if changed:
   tmp=LIVE/'index.html.video-ui-rollback';shutil.copyfile(str(backup/'index.html'),str(tmp));os.chmod(str(tmp),0o644);os.replace(str(tmp),str(LIVE/'index.html'));print('PREVIOUS_HOME_RESTORED')
  raise
 print('VIDEO_UI_DEPLOYED');print('BACKUP='+str(backup));print('No Agent restart; backend, invitations and visitor data unchanged.')
try:main()
except Exception as e:print('VIDEO_UI_UPDATE_STOPPED: '+str(e),file=sys.stderr);sys.exit(1)
