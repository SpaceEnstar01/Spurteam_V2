const {spawn}=require('node:child_process');
const {openSync,closeSync,readFileSync,renameSync,existsSync}=require('node:fs');
const {join}=require('node:path');
const {listJobs,writeJob,readJob}=require('../video-generation/jobs.cjs');
function startWorker(root,config){
 let busy=false,stopped=false,current=null;
 // A process restart must never silently regenerate an interrupted job.
 for(const j of listJobs(root))if(j.provider==='openmontage'&&j.status==='generating'){j.status='failed';j.error='渲染服务重启，任务已中断；未自动重复生成。';writeJob(root,j)}
 function tick(){
  if(stopped||busy)return;
  const j=listJobs(root).filter(j=>j.provider==='openmontage'&&j.status==='queued'&&Number(j.nextRenderAt||0)<=Date.now()).sort((a,b)=>Date.parse(a.createdAt)-Date.parse(b.createdAt))[0];if(!j)return;
  busy=true;j.status='generating';j.phase='配音、字幕与渲染';j.startedAt=new Date().toISOString();writeJob(root,j);
  const fd=openSync(join(root,j.id+'.render.log'),'a',0o600);
  const env={PATH:process.env.PATH,HOME:process.env.HOME,LANG:'en_US.UTF-8',SPUR_OPENMONTAGE_ROOT:config.SPUR_OPENMONTAGE_ROOT,SPUR_OPENMONTAGE_CATALOG:config.SPUR_OPENMONTAGE_CATALOG,SPUR_RENDER_CHROME:config.SPUR_RENDER_CHROME,SPUR_TTS_PROXY:config.SPUR_TTS_PROXY||'',SPUR_FFMPEG:config.SPUR_FFMPEG||'ffmpeg',SPUR_FFPROBE:config.SPUR_FFPROBE||'ffprobe'};
  const production=j.plan?.version===2;
  const execBin=production?process.execPath:config.SPUR_OPENMONTAGE_PYTHON;
  const pythonArgs=[join(__dirname,production?'produce.cjs':'render.py'),join(root,j.id+'.json')];
  const locked=Boolean(config.SPUR_OPENMONTAGE_LOCK_FILE);
  const binary=locked?'/usr/bin/flock':execBin;
  const args=locked?['--no-fork','--nonblock','--conflict-exit-code','75',config.SPUR_OPENMONTAGE_LOCK_FILE,execBin,...pythonArgs]:pythonArgs;
  const child=spawn(binary,args,{env,detached:true,stdio:[production?'pipe':'ignore',fd,fd]});closeSync(fd);
  if(production){child.stdin.on('error',()=>{});child.stdin.end(JSON.stringify({apiKey:config.SILICONFLOW_API_KEY,baseUrl:config.SILICONFLOW_BASE_URL||'https://api.siliconflow.cn/v1',python:config.SPUR_OPENMONTAGE_PYTHON}))}
  let timedOut=false,settled=false;current={child,id:j.id};
  const terminate=()=>{try{process.kill(-child.pid,'SIGTERM')}catch{}};
  const timer=setTimeout(()=>{timedOut=true;terminate();const force=setTimeout(()=>{try{process.kill(-child.pid,'SIGKILL')}catch{}},3000);force.unref()},production?1800000:600000);timer.unref();
  const done=(code,error)=>{
   if(settled)return;settled=true;clearTimeout(timer);
   const latest=readJob(root,j.id);const pending=join(root,j.id+'.rendered.mp4');
   if(locked&&code===75){latest.status='queued';latest.phase='等待其他视频完成';latest.nextRenderAt=Date.now()+2500;latest.error=null}
   else if(code===0&&existsSync(pending)){renameSync(pending,join(root,j.id+'.mp4'));latest.status='completed';latest.phase='视频已完成';latest.completedAt=new Date().toISOString()}
   else{latest.status='failed';latest.error=timedOut?'渲染超过10分钟，已停止。':error?.message||'OpenMontage制作失败；详情见该任务渲染日志。';try{latest.error=JSON.parse(readFileSync(join(root,j.id+'.failure.json'),'utf8')).error}catch{}}
   writeJob(root,latest);busy=false;current=null;
  };
  child.on('error',e=>done(-1,e));child.on('exit',code=>done(code));
 }
 tick();const timer=setInterval(tick,1000);timer.unref();return()=>{stopped=true;clearInterval(timer);if(current){const j=readJob(root,current.id);j.status='failed';j.error='渲染服务停止，任务未完成；不会自动重复生成。';writeJob(root,j);try{process.kill(-current.child.pid,'SIGTERM')}catch{}}};
}
module.exports={startWorker};
