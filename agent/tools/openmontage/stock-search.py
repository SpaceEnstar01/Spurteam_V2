"""Bounded real OpenMontage stock acquisition; no model secrets."""
import sys,os,json,pathlib,dataclasses
sys.path.insert(0,os.environ['SPUR_OPENMONTAGE_ROOT'])
from tools.video.direct_clip_search import DirectClipSearch
out=pathlib.Path(sys.argv[1]);out.mkdir(parents=True,exist_ok=True)
r=DirectClipSearch().execute({'output_dir':str(out),'queries':[{'query':sys.argv[2]}],'sources':['wikimedia'],'clips_per_query':2,'extract_thumbnails':True,'timeout_seconds':70})
(out/'search-result.json').write_text(json.dumps(dataclasses.asdict(r),ensure_ascii=False,indent=2))
if not r.success:raise RuntimeError(r.error)
