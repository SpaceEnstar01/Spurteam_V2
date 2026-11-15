"""Fixed executor: creative plan comes from DSH, never from a coding assistant here."""
import asyncio,dataclasses,json,os,pathlib,subprocess,sys,time,traceback,shutil
import edge_tts
JOB=pathlib.Path(sys.argv[1]).resolve();ROOT=pathlib.Path(os.environ['SPUR_OPENMONTAGE_ROOT']).resolve();sys.path.insert(0,str(ROOT))
from lib.checkpoint import init_project,write_checkpoint
from lib.pipeline_loader import load_pipeline
from tools.video.video_compose import VideoCompose
FF=os.environ.get('SPUR_FFMPEG','ffmpeg');PROBE=os.environ.get('SPUR_FFPROBE','ffprobe')
def run(args):
 r=subprocess.run(args,capture_output=True,text=True,timeout=180)
 if r.returncode:raise RuntimeError(r.stderr[-1800:])
 return r.stdout
def probe(p):return json.loads(run([PROBE,'-v','error','-show_streams','-show_format','-of','json',str(p)]))
def save(p,data):p.write_text(json.dumps(data,ensure_ascii=False,indent=2))
async def main():
 started=time.time();job=json.loads(JOB.read_text());plan=job['plan'];duration=plan['duration'];catalog_path=JOB.parent/('production-'+job['id'])/'catalog.json' if plan.get('version')==2 else pathlib.Path(os.environ['SPUR_OPENMONTAGE_CATALOG']);catalog=json.loads(catalog_path.read_text());clips={a['id']:a for a in catalog['clips']}
 assert 5<=duration<=30 and 1<=len(plan['scenes'])<=6
 offsets=[];offset=0
 for s in plan['scenes']:offsets.append(offset);offset+=s.get('duration',4)
 assert offset==duration
 load_pipeline('documentary-montage');projects=JOB.parent/'openmontage-projects';pid='video-'+job['id'];project=init_project(pid,title=plan['title'],pipeline_type='documentary-montage',pipeline_dir=projects)
 art=project/'artifacts';audio=project/'assets/audio';audio.mkdir(parents=True,exist_ok=True)
 save(art/'dsh-plan.json',plan)
 def cp(stage,name,data):
  save(art/(name+'.json'),data)
  write_checkpoint(projects,pid,stage,'completed',{name:data},pipeline_type='documentary-montage',human_approved=True,metadata={'approval':'User delegated this video production without intermediate approvals','authorship':'DSH supplies title, narration, asset selection and editorial reasons','review_scope':'Schema and executable constraints checked; creative quality requires playback'})
 brief={'version':'1.0','title':plan['title'],'hook':plan['scenes'][0]['narration'],'key_points':[s['narration'] for s in plan['scenes']],'tone':'reverent','style':'DSH-directed narrated vertical short','target_platform':'tiktok','target_duration_seconds':duration,'metadata':{'source_records_simulated':plan.get('version')!=2,'illustrative_stock':True,'render_runtime':'remotion','renderer_family':'documentary-montage','composition_mode':'templated','approval':'User approved minimal fixed production tool','runtime_options_considered':{'remotion':'selected: documentary-montage native runtime','hyperframes':'not selected: documentary end-tag parity unavailable'}}};cp('idea','brief',brief)
 sceneplan={'version':'1.0','scenes':[{'id':str(i),'type':'broll','description':s['reason'],'start_seconds':offsets[i],'end_seconds':offsets[i]+s.get('duration',4)} for i,s in enumerate(plan['scenes'])]};cp('scene_plan','scene_plan',sceneplan)
 scenes=[];assets=[];captions=[];measured=[]
 for i,s in enumerate(plan['scenes']):
  seconds=s.get('duration',4);asset=clips[s['asset_id']];source=pathlib.Path(asset['path']).resolve()
  if not source.is_file() or float(probe(source)['format']['duration'])<seconds:raise RuntimeError('所选素材短于分镜时长：'+s['asset_id'])
  # Only catalog paths are trusted; never execute arbitrary model paths or code.
  mp3=audio/(str(i)+'.mp3');wav=audio/(str(i)+'.wav')
  await asyncio.wait_for(edge_tts.Communicate(s['narration'],'en-GB-SoniaNeural',rate='-8%',proxy=os.environ.get('SPUR_TTS_PROXY') or None).save(str(mp3)),90)
  actual=float(probe(mp3)['format']['duration']);speed=max(1,actual/(seconds-.35))
  if speed>1.25:raise RuntimeError('旁白过长，不能自然放入当前分镜')
  run([FF,'-y','-i',str(mp3),'-af',f'atempo={speed},adelay=100|100,apad','-t',str(seconds),'-ar','48000','-ac','2','-c:a','pcm_s16le',str(wav)])
  measured.append({'scene':i,'original_tts_seconds':actual,'speed':speed})
  scenes.append({'id':str(i),'kind':'video','src':str(source),'startSeconds':offsets[i],'durationSeconds':seconds,'fadeInFrames':6,'fadeOutFrames':6,'filter':'contrast(1.03) saturate(0.95)'})
  assets.append({'id':str(i),'type':'video','path':str(source),'source_tool':asset.get('kind','stock')+' acquisition, selected by DSH','scene_id':str(i),'license':asset['license'],'original_url':asset['original_url'],'duration_seconds':seconds})
  words=s['narration'].split();groups=[' '.join(words[n:n+5]) for n in range(0,len(words),5)];t=offsets[i]+.1;spoken=actual/speed;total=sum(len(g) for g in groups)
  for g in groups:
   dt=spoken*len(g)/total;captions.append({'word':g,'startMs':round(t*1000),'endMs':round((t+dt)*1000)});t+=dt
 (audio/'concat.txt').write_text(''.join("file '"+str(audio/(str(i)+'.wav'))+"'\n" for i in range(len(plan['scenes']))))
 narration=audio/'narration.wav';run([FF,'-y','-f','concat','-safe','0','-i',str(audio/'concat.txt'),'-c:a','pcm_s16le',str(narration)])
 music=pathlib.Path(catalog['music']).resolve();assert music.is_file()
 assets.extend([{'id':'narration','type':'narration','path':str(narration),'source_tool':'edge-tts Sonia','scene_id':'all'},{'id':'music','type':'music','path':str(music),'source_tool':'existing original procedural music','scene_id':'all'}]);manifest={'version':'1.0','assets':assets};cp('assets','asset_manifest',manifest)
 cuts=[{'id':str(i),'source':str(i),'in_seconds':0,'out_seconds':s.get('duration',4),'reason':s['reason'],'transition_in':'fade','transition_out':'fade','transition_duration':.2} for i,s in enumerate(plan['scenes'])]
 edit={'version':'1.0','cuts':cuts,'render_runtime':'remotion','renderer_family':'documentary-montage','composition_mode':'templated','audio':{'narration':{'segments':[{'asset_id':'narration','start_seconds':0,'end_seconds':duration}]},'music':{'asset_id':'music','volume':.2,'fade_in_seconds':.3,'fade_out_seconds':1}},'end_tag':{'offset_seconds':duration-2,'notes':'DSH title over final footage'},'metadata':{'dsh_plan_path':str(art/'dsh-plan.json'),'caption_alignment':'estimated by phrase length, not ASR'}};cp('edit','edit_decisions',edit)
 # Native renderer-specific props are kept separate from the canonical schema artifact.
 scenes.append({'id':'end-tag','kind':'title','startSeconds':duration-2,'durationSeconds':2,'text':plan['title'],'backgroundSrc':str(clips[plan['scenes'][-1]['asset_id']]['path']),'backgroundTrimBeforeSeconds':plan['scenes'][-1].get('duration',4)-2,'variant':'overlay','intensity':.05})
 props={**edit,'scenes':scenes,'soundtrack':{'src':str(narration),'volume':1,'fadeOutSeconds':.15},'music':{'src':str(music),'volume':.2,'fadeInSeconds':.3,'fadeOutSeconds':1},'captions':{'words':captions,'wordsPerPage':1},'captionProps':{'wordsPerPage':1,'fontSize':40,'bottomOffset':245,'fontFamily':'Arial, sans-serif','wordSeparator':' ','wordStyle':{'whiteSpace':'normal','maxWidth':'100%'},'boxStyle':{'maxWidth':'84%','padding':'8px 18px','textAlign':'center'},'wordPop':{'scale':1}},'titleFontSize':54,'titleWidth':850,'signalLineCount':0};save(art/'render_props.json',props)
 output=project/'renders/final.mp4'
 args={'operation':'render','edit_decisions':props,'asset_manifest':manifest,'proposal_packet':{'production_plan':{'render_runtime':'remotion','renderer_family':'documentary-montage'}},'scene_plan':sceneplan['scenes'],'output_path':str(output),'profile':'youtube_shorts','remotion_concurrency':1,'remotion_timeout_ms':180000}
 if os.environ.get('SPUR_RENDER_CHROME'):args['remotion_browser_executable']=os.environ['SPUR_RENDER_CHROME']
 print('OPENMONTAGE_RENDER_STARTED',flush=True);result=VideoCompose().execute(args);save(art/'tool-result.json',dataclasses.asdict(result))
 if not result.success:raise RuntimeError(str(result.error))
 final=JOB.with_suffix('.rendered.mp4');run([FF,'-y','-i',str(output),'-t',str(duration),'-c:v','copy','-c:a','aac','-movflags','+faststart',str(final)])
 info=probe(final);v=next(s for s in info['streams'] if s['codec_type']=='video');assert abs(float(info['format']['duration'])-duration)<.05 and (v['width'],v['height'])==(1080,1920) and int(v['nb_frames'])==duration*30
 assert any(s['codec_type']=='audio' for s in info['streams']);run([FF,'-v','error','-i',str(final),'-f','null','-'])
 cp('compose','render_report',{'version':'1.0','outputs':[{'path':str(final),'format':'mp4','resolution':'1080x1920','duration_seconds':duration,'fps':30}],'render_time_seconds':time.time()-started,'metadata':{'audio':measured,'full_decode_passed':True,'music_mixed':True,'end_tag_rendered':True}})
 shutil.copy(catalog['attribution_file'],project/'素材来源与署名.md')
 print('OPENMONTAGE_MP4_VERIFIED',flush=True)
if __name__=='__main__':
 try:asyncio.run(main())
 except Exception as e:
  save(JOB.with_suffix('.failure.json'),{'error':type(e).__name__+': '+str(e)[:1200]});traceback.print_exc();sys.exit(1)
