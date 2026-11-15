// Fixed production driver; input creativity comes from DSH. Model key is stdin-only.
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process');
const jobs=require('../video-generation/jobs.cjs');const {downloadVideo,videoRequest}=require('../video-generation/client.cjs');
const file=process.argv[2],root=path.dirname(file),job=JSON.parse(fs.readFileSync(file,'utf8')),work=path.join(root,'production-'+job.id);fs.mkdirSync(work,{recursive:true});
function save(name,value){const p=path.join(work,name),tmp=p+'.tmp';fs.writeFileSync(tmp,JSON.stringify(value,null,2),{mode:0o600});fs.renameSync(tmp,p)}
function phase(s){const j=jobs.readJob(root,job.id);j.phase=s;jobs.writeJob(root,j);console.log(s)}
function run(bin,args,timeout=180000){return new Promise((resolve,reject)=>{const c=spawn(bin,args,{env:process.env,stdio:['ignore','pipe','pipe']});let output='';c.stdout.on('data',b=>output+=b);c.stderr.on('data',b=>{if(output.length<12000)output+=b});const timer=setTimeout(()=>c.kill('SIGTERM'),timeout);c.on('error',reject);c.on('close',code=>{clearTimeout(timer);code===0?resolve(output):reject(Error(output.slice(-1800)||'制作子进程失败'))})})}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(config){
 const base=config.baseUrl.replace(/\/$/,'');const u=new URL(base);if(u.protocol!=='https:'||u.username||u.password||!config.apiKey)throw Error('缺少有效的视频服务配置');
 async function api(route,data){const r=await fetch(base+route,{method:data?'POST':'GET',headers:{Authorization:'Bearer '+config.apiKey,...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,signal:AbortSignal.timeout(30000),redirect:'error'});if(!r.ok){let detail='';try{detail=(await r.json()).message||''}catch{}throw Error('视频模型服务 HTTP '+r.status+' '+String(detail).slice(0,250))}return r.json()}
 let model=null;
 async function generate(scene,index){
  if(!model){const available=(await api('/models?type=video')).data.map(x=>x.id);model=['MiniMaxAI/MiniMax-H3'].find(m=>available.includes(m));if(!model)throw Error('现有Key未返回已适配的视频模型；没有提交付费生成');save('model.json',{model,available})}
  const stateName='scene-'+index+'.json',stateFile=path.join(work,stateName);let state=fs.existsSync(stateFile)?JSON.parse(fs.readFileSync(stateFile,'utf8')):{};
  if(!state.requestId){
   if(state.submitting)throw Error('视频提交结果未知，禁止自动重复扣费；请核对原请求');
   state={submitting:true,model};save(stateName,state);
   const args=videoRequest(model,{prompt:scene.visual_prompt,size:'720x1280'});
   const r=await api('/video/submit',args);if(typeof r.requestId!=='string')throw Error('视频服务未返回requestId，禁止重复提交');state.requestId=r.requestId;save(stateName,state);
  }
  let url;
  for(let n=0;n<150;n++){const r=await api('/video/status',{requestId:state.requestId});state.status=r.status;save(stateName,state);if(r.status==='Succeed'){url=r.results?.videos?.[0]?.url;break}if(r.status==='Failed')throw Error('视频生成服务报告失败');if(!['InQueue','InProgress'].includes(r.status))throw Error('视频生成返回未知状态');await sleep(6000)}
  if(!url)throw Error('视频生成等待超时；原requestId已保存，不会自动重新提交');
  const target=path.join(work,'scene-'+index+'.mp4');fs.writeFileSync(target,await downloadVideo(url));return{path:target,license:'AI generated; provider terms apply',original_url:'https://api.siliconflow.cn',description:scene.visual_prompt,kind:'generated',model};
 }
 async function stock(scene,index){
  const dir=path.join(work,'stock-'+index);await run(config.python,[path.join(__dirname,'stock-search.py'),dir,scene.search_query],95000);
  const result=JSON.parse(fs.readFileSync(path.join(dir,'search-result.json'),'utf8'));const clips=result.data?.clips||result.data?.downloaded||[];
  const candidates=clips.filter(x=>x.kind==='video'&&x.path&&x.license&&/^(CC0|CC BY|Public domain)/i.test(x.license)&&Number(x.duration)>=scene.duration);
  if(!candidates.length)throw Error('公开素材检索未返回时长及许可符合要求的动态镜头');
  const x=candidates[0],full=path.resolve(x.path);if(!full.startsWith(path.resolve(dir)+path.sep))throw Error('素材路径越界');return{path:full,license:x.license,original_url:x.source_url,description:scene.search_query,kind:'stock',creator:x.creator,match_verified:false};
 }
 const clips=[];
 for(let i=0;i<job.plan.scenes.length;i++){
  const s=job.plan.scenes[i];phase('准备画面 '+(i+1)+'/'+job.plan.scenes.length);let asset;
  if(s.source==='generate')asset=await generate(s,i);
  else try{asset=await stock(s,i)}catch(e){if(s.source==='stock')throw e;console.log('素材未满足约束，按auto计划生成新画面');asset=await generate(s,i)}
  clips.push({id:s.asset_id,...asset});save('sources.json',clips);
 }
 const original=JSON.parse(fs.readFileSync(process.env.SPUR_OPENMONTAGE_CATALOG,'utf8'));
 const credit=path.join(work,'素材来源与说明.md');fs.writeFileSync(credit,'# 素材来源\n\n'+clips.map(x=>`- ${x.id}: ${x.kind}; ${x.license}; ${x.original_url}; ${x.creator||''}\n  ${x.description}\n`).join('\n')+'\n生成镜头为AI合成，不代表现场实拍；人物数量、身份、地点等视觉细节未经自动视觉验收。库存镜头仅为说明性画面，匹配未自动视觉核实。\n\n背景音乐沿用本项目本地原创氛围音乐。\n');
 save('catalog.json',{clips,music:original.music,attribution_file:credit});const published=jobs.readJob(root,job.id);published.sources=clips.map(({kind,license,original_url,creator,model})=>({kind,license,url:original_url,creator:creator||'',model:model||''}));jobs.writeJob(root,published);phase('配音、字幕与OpenMontage合成');
 const output=await run(config.python,[path.join(__dirname,'render.py'),file],600000);console.log(output.slice(-1500));
}
let secret='';process.stdin.on('data',b=>{secret+=b;if(secret.length>12000)process.exit(1)});process.stdin.on('end',()=>{let config;try{config=JSON.parse(secret);secret=''}catch{console.error('无效内部配置');process.exitCode=1;return}main(config).catch(e=>{const message=String(e.message).replaceAll(config.apiKey||'__no_key__','[REDACTED]').slice(0,1800);fs.writeFileSync(file.replace(/\.json$/,'.failure.json'),JSON.stringify({error:message}));console.error(message);process.exitCode=1})});
