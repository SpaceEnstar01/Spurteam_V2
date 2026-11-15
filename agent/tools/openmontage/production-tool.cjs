const {basename,join}=require('node:path');const {randomUUID}=require('node:crypto');const {appendFileSync}=require('node:fs');const {listJobs,writeJob,publicJob}=require('../video-generation/jobs.cjs');
function validate(p){
 if(!p||typeof p.title!=='string'||!p.title.trim()||p.title.length>80||!Number.isInteger(p.duration)||p.duration<5||p.duration>30||p.aspect_ratio!=='9:16'||!Array.isArray(p.scenes)||p.scenes.length<1||p.scenes.length>6)throw Error('需要标题、5–30秒时长、9:16比例和1–6个分镜');
 let total=0;const scenes=p.scenes.map((s,i)=>{
  if(!Number.isInteger(s.duration)||s.duration<3||s.duration>5||!['auto','stock','generate'].includes(s.source)||typeof s.visual_prompt!=='string'||!s.visual_prompt.trim()||s.visual_prompt.length>1500||typeof s.narration!=='string'||!s.narration.trim()||s.narration.length>250||s.narration.trim().split(/\s+/).length>s.duration*3||typeof s.reason!=='string'||s.reason.length>500)throw Error('每个分镜需要3–5秒、source、英文visual_prompt/旁白和选材理由');
  total+=s.duration;return{asset_id:'scene-'+i,duration:s.duration,source:s.source,visual_prompt:s.visual_prompt,narration:s.narration,reason:s.reason,search_query:typeof s.search_query==='string'?s.search_query.slice(0,250):s.visual_prompt.slice(0,250)};
 });if(total!==p.duration)throw Error('分镜时长之和必须等于总时长');
 return{version:2,title:p.title,duration:p.duration,aspect_ratio:p.aspect_ratio,voice:'en-GB-SoniaNeural',scenes};
}
function apply(ctx){const root=process.env.SPUR_VIDEO_JOBS_ROOT,out=process.env.SPUR_RESEARCH_OUTPUT;
 ctx.tools.register({name:'video_produce',description:'Create a NEW narrated vertical video for arbitrary scenes through stock search or AI video generation, voice, English captions, music and real OpenMontage composition. Supports 5–30 seconds; each scene is 3–5 seconds (10s=two 5s scenes). Does not require mountain footage. Author plan_json: {title,duration,aspect_ratio:"9:16",scenes:[{duration,source:"auto"|"stock"|"generate",visual_prompt,narration,reason,search_query}]}. Use generate for precise requested locations/people/actions (e.g. six players at a Los Angeles basketball court), stock for documentary real footage, auto for illustrative B-roll with generation fallback. Stock cannot verify exact people/location; generated imagery is synthetic and exact counts are not guaranteed. Do not submit twice or poll; website tracks the async job.',parameters:{plan_json:{type:'string',required:true}},output:{schema:{type:'object',additionalProperties:true},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]},async execute({plan_json}){
  if(typeof plan_json!=='string'||plan_json.length>12000)throw Error('无效制作计划');const plan=validate(JSON.parse(plan_json)),runId=basename(out),old=listJobs(root).find(j=>j.runId===runId&&j.provider==='openmontage');if(old)return publicJob(old);
  const j={id:randomUUID(),runId,provider:'openmontage',status:'queued',phase:'等待素材检索／画面生成',createdAt:new Date().toISOString(),plan};writeJob(root,j);
  for(const e of [{event:'call',args:{plan}},{event:'result',available:true,jobId:j.id}])appendFileSync(join(out,'tool-events.jsonl'),JSON.stringify({at:new Date().toISOString(),id:j.id,tool:'video_produce',...e})+'\n');
  return{...publicJob(j),instruction:'已提交真实后台制作，尚未完成；简短说明网页将交付视频。不得声称完成、重复提交或把生成画面称为现场实拍。'};
 }});
}
module.exports={apply,validate};
