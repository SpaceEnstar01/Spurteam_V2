const {test}=require('node:test');const assert=require('node:assert/strict');const {mkdtempSync,rmSync,readFileSync,existsSync}=require('node:fs');const {tmpdir}=require('node:os');const {join}=require('node:path');const {randomUUID}=require('node:crypto');
const {submitVideo,videoStatus}=require('./client.cjs');const {writeJob,readJob,advanceJob,publicJob}=require('./jobs.cjs');
const config={apiKey:'private-key',baseUrl:'https://api.siliconflow.cn/v1',model:'Wan-AI/Wan2.2-T2V-A14B'};
test('MiniMax H3 submits new parameters and maps old size hints to ratios without image_size',async()=>{
 for(const [size,ratio]of[['1280x720','16:9'],['720x1280','9:16'],['960x960','1:1']]){
  let body;
  await submitVideo({...config,model:'MiniMaxAI/MiniMax-H3'},{prompt:'A creator introduces a camera',size},async(_url,options)=>{body=JSON.parse(options.body);return{ok:true,json:async()=>({requestId:'h3-job'})}});
  assert.deepEqual(body,{model:'MiniMaxAI/MiniMax-H3',prompt:'A creator introduces a camera',duration:5,resolution:'768p',ratio});
 }
 let body;
 await submitVideo({...config,model:'MiniMaxAI/MiniMax-H3'},{prompt:'Paris street scene',duration:12,resolution:'480p',ratio:'21:9'},async(_url,options)=>{body=JSON.parse(options.body);return{ok:true,json:async()=>({requestId:'h3-wide'})}});
 assert.equal(body.duration,12);assert.equal(body.ratio,'21:9');assert.equal(body.resolution,'480p');
});
test('invalid H3 generation parameters fail before any paid submission',async()=>{
 let calls=0;const submit=async()=>{calls++;throw Error('must not submit')};
 for(const input of [{duration:4},{duration:16},{duration:5.5},{duration:null},{resolution:'720p'},{ratio:'2:1'}]){
  await assert.rejects(submitVideo({...config,model:'MiniMaxAI/MiniMax-H3'},{prompt:'Test scene',...input},submit));
 }
 assert.equal(calls,0);
});
test('submission uses verified async endpoint, model and supported size only',async()=>{
 let sent;const id=await submitVideo(config,{prompt:'A person plays football on a ship',size:'1280x720'},async(url,options)=>{sent={url:String(url),...options};return{ok:true,json:async()=>({requestId:'provider-123'})}});
 assert.equal(id,'provider-123');assert.equal(sent.url,'https://api.siliconflow.cn/v1/video/submit');assert.deepEqual(JSON.parse(sent.body),{model:config.model,prompt:'A person plays football on a ship',image_size:'1280x720'});
 await assert.rejects(submitVideo(config,{prompt:'x',size:'unsupported'}));
 await assert.rejects(submitVideo(config,{prompt:'x'},async()=>({ok:false,status:401})),e=>e.definitive&&!e.message.includes(config.apiKey));
});
test('status maps provider states without declaring queued jobs complete',async()=>{
 for(const [remote,local]of[['InQueue','queued'],['InProgress','generating'],['Succeed','ready'],['Failed','failed']]){
  const result=await videoStatus(config,'provider-123',async()=>({ok:true,json:async()=>({status:remote,results:{videos:[{url:'https://cdn.example/video.mp4'}]}})}));assert.equal(result.status,local)
 }
});
test('persisted queued job resumes querying and downloads once, never resubmits',async()=>{
 const root=mkdtempSync(join(tmpdir(),'spur-video-'));const id=randomUUID();const now=Date.now();let query=0,download=0;
 try{
  writeJob(root,{id,status:'queued',requestId:'original-request',createdAt:new Date(now).toISOString()});
  const getStatus=async(_config,requestId)=>{assert.equal(requestId,'original-request');return[++query===1?{status:'generating'}:{status:'ready',url:'https://cdn.example/video.mp4'}][0]};
  await advanceJob(root,id,config,{getStatus,now});
  assert.equal(readJob(root,id).status,'generating');
  await advanceJob(root,id,config,{getStatus,now:now+11000,download:async()=>{download++;return Buffer.from('test-video')}});
  assert.equal(readJob(root,id).status,'completed');assert.equal(download,1);assert.equal(readFileSync(join(root,id+'.mp4'),'utf8'),'test-video');
  assert.ok(publicJob(readJob(root,id)).url.endsWith('/file'));assert.equal('requestId'in publicJob(readJob(root,id)),false)
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('download failure keeps original provider id for later recovery',async()=>{
 const root=mkdtempSync(join(tmpdir(),'spur-video-'));const id=randomUUID();const now=Date.now();
 try{
  writeJob(root,{id,status:'queued',requestId:'same-id',createdAt:new Date(now).toISOString()});
  const getStatus=async(_config,requestId)=>{assert.equal(requestId,'same-id');return{status:'ready',url:'https://cdn.example/video.mp4'}};
  await advanceJob(root,id,config,{now,getStatus,download:async()=>{throw new Error('network')}});
  assert.equal(readJob(root,id).status,'downloading');assert.equal(existsSync(join(root,id+'.mp4')),false);
  await advanceJob(root,id,config,{now:now+20000,getStatus,download:async()=>Buffer.from('video')});assert.equal(readJob(root,id).status,'completed')
 }finally{rmSync(root,{recursive:true,force:true})}
});
test('tool calls in the same task cannot submit the paid job twice',async()=>{
 const root=mkdtempSync(join(tmpdir(),'spur-video-'));const client=require('./client.cjs');const original=client.submitVideo;let calls=0;
 const previous={root:process.env.SPUR_VIDEO_JOBS_ROOT,out:process.env.SPUR_RESEARCH_OUTPUT,model:process.env.SPUR_VIDEO_T2V_MODEL};process.env.SPUR_VIDEO_JOBS_ROOT=root;process.env.SPUR_RESEARCH_OUTPUT=root;process.env.SPUR_VIDEO_T2V_MODEL='MiniMaxAI/MiniMax-H3';
 try{
  client.submitVideo=async()=>{calls++;return'one-request'};delete require.cache[require.resolve('./index.cjs')];const tools=new Map();require('./index.cjs').apply({tools:{register:value=>{tools.set(value.name,value)}}});const tool=tools.get('video_generate');
  const first=await tool.execute({prompt:'Football on a ship'});const second=await tool.execute({prompt:'Football on a ship'});assert.equal(calls,1);assert.equal(first.id,second.id);assert.equal((await tools.get('video_status').execute({})).id,first.id);assert.equal(calls,1)
 }finally{client.submitVideo=original;delete require.cache[require.resolve('./index.cjs')];for(const [key,value]of[['SPUR_VIDEO_JOBS_ROOT',previous.root],['SPUR_RESEARCH_OUTPUT',previous.out],['SPUR_VIDEO_T2V_MODEL',previous.model]]){if(value===undefined)delete process.env[key];else process.env[key]=value}rmSync(root,{recursive:true,force:true})}
});
