const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {randomUUID}=require('node:crypto');
const {validate}=require('./index.cjs');const jobs=require('../video-generation/jobs.cjs');
test('model cannot inject arbitrary source paths or overlong narration',()=>{
 const c={clips:[{id:'a'}]},p={title:'Short title',scenes:[{asset_id:'a',narration:'A brief line.',reason:'record 6'},{asset_id:'a',narration:'Another brief line.',reason:'record 15'}]};
 assert.equal(validate(p,c).duration,8);assert.throws(()=>validate({...p,scenes:[{...p.scenes[0],asset_id:'/etc/passwd'},p.scenes[1]]},c));
 assert.throws(()=>validate({...p,scenes:[{...p.scenes[0],narration:'word '.repeat(13)},p.scenes[1]]},c));
});
test('OpenMontage jobs never enter the paid video polling worker',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spur-montage-test-'));try{
  const j={id:randomUUID(),status:'queued',provider:'openmontage',createdAt:new Date().toISOString()};jobs.writeJob(root,j);let called=false;
  await jobs.advanceJob(root,j.id,{}, {getStatus:async()=>{called=true;throw Error('wrong provider')}});assert.equal(called,false);assert.equal(jobs.readJob(root,j.id).status,'queued');
 }finally{fs.rmSync(root,{recursive:true,force:true})}
});
test('tool persists one job per DSH run and returns existing job on duplicate',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spur-montage-tool-'));const old={...process.env};try{
  const out=path.join(root,randomUUID());fs.mkdirSync(out);const c=path.join(root,'catalog.json');fs.writeFileSync(c,JSON.stringify({clips:[{id:'a'}]}));Object.assign(process.env,{SPUR_RESEARCH_OUTPUT:out,SPUR_VIDEO_JOBS_ROOT:root,SPUR_OPENMONTAGE_CATALOG:c});const tools={};require('./index.cjs').apply({tools:{register:t=>tools[t.name]=t}});
  const plan_json=JSON.stringify({title:'Test',scenes:[{asset_id:'a',narration:'Walk slowly.',reason:'record 5'},{asset_id:'a',narration:'Find peace.',reason:'record 15'}]});const first=await tools.montage_generate.execute({plan_json}),second=await tools.montage_generate.execute({plan_json});assert.equal(first.id,second.id);assert.equal(jobs.listJobs(root).length,1);
 }finally{for(const k of ['SPUR_RESEARCH_OUTPUT','SPUR_VIDEO_JOBS_ROOT','SPUR_OPENMONTAGE_CATALOG'])if(old[k]===undefined)delete process.env[k];else process.env[k]=old[k];fs.rmSync(root,{recursive:true,force:true})}
});
test('missing renderer executable produces a terminal failure without retrying',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'spur-montage-failure-'));let stop;
 try{
  const id=randomUUID();jobs.writeJob(root,{id,provider:'openmontage',status:'queued',createdAt:new Date().toISOString()});
  stop=require('./worker.cjs').startWorker(root,{SPUR_OPENMONTAGE_PYTHON:'/nonexistent/spur-test-python'});
  await new Promise(resolve=>setTimeout(resolve,100));const job=jobs.readJob(root,id);assert.equal(job.status,'failed');assert.match(job.error,/ENOENT/);
 }finally{stop?.();fs.rmSync(root,{recursive:true,force:true})}
});
