const {appendFileSync,readFileSync}=require('node:fs');
const {join,basename}=require('node:path');
const {randomUUID}=require('node:crypto');
const {listJobs,writeJob,publicJob}=require('../video-generation/jobs.cjs');
function catalog(){return JSON.parse(readFileSync(process.env.SPUR_OPENMONTAGE_CATALOG,'utf8'))}
function validate(plan,c){
 if(!plan||typeof plan.title!=='string'||!plan.title.trim()||plan.title.length>80)throw Error('需要80字符内的标题');
 if(!Array.isArray(plan.scenes)||plan.scenes.length!==2)throw Error('8秒测试需要两个4秒分镜');
 const ids=new Set(c.clips.map(x=>x.id));
 for(const s of plan.scenes){
  if(!ids.has(s.asset_id)||typeof s.narration!=='string'||!s.narration.trim()||s.narration.length>150||s.narration.trim().split(/\s+/).length>12||!/[a-z]/i.test(s.narration))throw Error('每个分镜需有效素材ID及最多12词的英文旁白');
  if(typeof s.reason!=='string'||!s.reason.trim()||s.reason.length>500)throw Error('每个分镜需说明选材依据');
 }
 return {title:plan.title,scenes:plan.scenes.map(s=>({asset_id:s.asset_id,narration:s.narration,reason:s.reason})),duration:8,aspect_ratio:'9:16',voice:'en-GB-SoniaNeural'};
}
exports.inject=['tools'];
exports.apply=ctx=>{
 require('./production-tool.cjs').apply(ctx);
 const root=process.env.SPUR_VIDEO_JOBS_ROOT,out=process.env.SPUR_RESEARCH_OUTPUT;
 const log=e=>appendFileSync(join(out,'tool-events.jsonl'),JSON.stringify({at:new Date().toISOString(),...e})+'\n');
 const output={schema:{type:'object',additionalProperties:true},render:(_a,v)=>[{type:'text',text:JSON.stringify(v)}]};
 ctx.tools.register({name:'montage_assets',description:'List licensed local source clips for a NEW 8-second English narrated documentary video. These are illustrative stock clips, not user footage. Choose two clips based on the user records. No finished movie is reused.',parameters:{},output,async execute(){
  const c=catalog(),id=randomUUID();log({event:'call',id,tool:'montage_assets',args:{}});
  const result={duration:8,scenes:2,seconds_per_scene:4,voice:'en-GB-SoniaNeural',clips:c.clips.map(({id,description,license})=>({id,description,license})),instruction:'Read the supplied records, author an original short English title and two sentences of at most 12 words each; select an asset_id and reason per scene. Call montage_generate once with plan_json containing {title,scenes:[{asset_id,narration,reason},...]}. Fixed tool handles voice, subtitles, music and real OpenMontage rendering asynchronously.'};
  log({event:'result',id,tool:'montage_assets',available:true});return result;
 }});
 ctx.tools.register({name:'montage_generate',description:'Create a NEW 8-second vertical video through OpenMontage from your own authored English narration and selected footage. Submit once and return, website tracks the video. plan_json must be JSON {title,scenes:[{asset_id,narration,reason},{asset_id,narration,reason}]}. Each narration is at most 12 English words. Do not submit a pre-existing finished video.',parameters:{plan_json:{type:'string',required:true}},output,async execute({plan_json}){
  if(typeof plan_json!=='string'||plan_json.length>5000)throw Error('无效视频计划');
  const plan=validate(JSON.parse(plan_json),catalog()),runId=basename(out);
  const prior=listJobs(root).find(j=>j.runId===runId&&j.provider==='openmontage');if(prior)return publicJob(prior);
  const job={id:randomUUID(),runId,provider:'openmontage',status:'queued',phase:'等待渲染',createdAt:new Date().toISOString(),plan};
  writeJob(root,job);log({event:'call',id:job.id,tool:'montage_generate',args:{plan}});log({event:'result',id:job.id,tool:'montage_generate',available:true,jobId:job.id});
  return {...publicJob(job),instruction:'已提交后台制作，尚未完成。简短告知用户网页会显示视频；不要轮询、重复提交或声称已经完成。'};
 }});
};
exports.validate=validate;
