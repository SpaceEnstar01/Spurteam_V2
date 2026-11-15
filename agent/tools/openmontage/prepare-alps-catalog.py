"""Prepare a licensed source catalog for this smoke test; does not download media."""
import argparse,json,pathlib
p=argparse.ArgumentParser();p.add_argument('--source',type=pathlib.Path,required=True);p.add_argument('--output',type=pathlib.Path,required=True);a=p.parse_args();b=a.source.resolve()
assets=json.loads((b/'projects/alps-finding-my-own-pace/artifacts/asset_manifest.json').read_text())['assets'];by={x['id']:x for x in assets};shots=json.loads((b/'shot-plan.json').read_text())['shots']
clips=[{'id':s['id'],'path':str((b/'shots'/pathlib.Path(s['path']).name).resolve()),'description':s['reason'],'license':by[s['id']]['license'],'original_url':by[s['id']]['original_url']} for s in shots if s['duration']>=4 and s['id']!='08']
for c in clips:
 if not pathlib.Path(c['path']).is_file():raise FileNotFoundError(c['path'])
catalog={'clips':clips,'music':str(b/'music-original.wav'),'attribution_file':str(b/'素材来源与署名.md')}
for key in ['music','attribution_file']:
 if not pathlib.Path(catalog[key]).is_file():raise FileNotFoundError(catalog[key])
a.output.parent.mkdir(parents=True,exist_ok=True);a.output.write_text(json.dumps(catalog,ensure_ascii=False,indent=2));print('CATALOG_READY clips='+str(len(clips)))
