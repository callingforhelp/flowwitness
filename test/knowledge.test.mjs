import test from 'node:test';
import assert from 'node:assert/strict';
import { createModule } from '../src/modules/knowledge/index.mjs';

function fixture() {
  const rows = new Map(); let time = Date.parse('2026-09-12T00:00:00Z');
  const key = (s,c,id) => JSON.stringify([s.application,s.conversationId,c,id]);
  const repository = {
    async create(s,c,r) { rows.set(key(s,c,r.id), structuredClone(r)); return structuredClone(r); },
    async get(s,c,id) { return structuredClone(rows.get(key(s,c,id)) ?? null); },
    async query(s,c) { return { items: [...rows.values()].filter(r => rows.get(key(s,c,r.id)) === r).map(r => structuredClone(r)), nextCursor:null }; },
    async update(s,c,id,{expectedVersion,patch}) { const r = await this.get(s,c,id); assert.equal(r.version,expectedVersion); return this.create(s,c,{...r,...patch,version:r.version+1}); },
  };
  const p = { application:'a', conversationId:'c1', role:'operator', subjectId:'op' };
  const scope = { application:'a',conversationId:'c1' };
  const artifacts = { async get() { return { sha256:'hash', expiresAt:new Date(time+10000).toISOString() }; } };
  const module = createModule({repository,artifacts,jobs:{},config:{now:()=>time}});
  const input = { kind:'observation', title:'Upload failed 上传失败', summary:'Retry succeeds 重试成功',locale:'zh',tags:['upload'],release:'r1' };
  async function evidence() {
    await repository.create(scope,'investigationJobs',{id:'j',...scope,status:'succeeded',resultRef:{collection:'evidenceBundles',id:'e'}});
    await repository.create(scope,'evidenceBundles',{id:'e',...scope,jobId:'j',status:'verified',validatorVersion:'1',target:{revision:'r1'},artifactIds:['a'],artifactHashes:{a:'hash'},expiresAt:new Date(time+1000).toISOString()});
  }
  return {module,p,input,evidence,repository,scope,advance:()=>{time+=2000;}};
}
test('bilingual deterministic search, provenance and scope isolation', async()=>{
  const {module:m,p,input} = fixture(); const entry = await m.create(p,input);
  assert.equal(entry.provenance.subjectId,'op');
  assert.equal((await m.search(p,{text:'上传'})).items[0].id,entry.id);
  assert.equal((await m.search(p,{text:'UPLOAD'})).items.length,1);
  for (const other of [{...p,application:'b'},{...p,conversationId:'c2'}]) {
    assert.equal((await m.search(other)).items.length,0);
    await assert.rejects(m.get(other,{id:entry.id}),{status:404});
    await assert.rejects(m.create(other,{...input,supersedes:[entry.id]}),{status:404});
  }
  await assert.rejects(m.get({...p,role:'customer'},{id:entry.id}),{status:404});
  await assert.rejects(m.search({...p,role:'customer',conversationId:null}),{status:403});
  await assert.rejects(m.create(p,{...input,evidenceStatus:'verified'}),{status:400});
  await assert.rejects(m.create(p,{...input,chainOfThought:'private'}),{status:400});
});
test('explicit publication, superseding, feedback and expired evidence', async()=>{
  const {module:m,p,input,evidence,advance} = fixture(); await evidence();
  const old = await m.create(p,{...input,evidenceBundleIds:['e']});
  await assert.rejects(m.publish({...p,role:'agent'},{id:old.id}),{status:403});
  await m.publish(p,{id:old.id});
  const customer = {...p,role:'customer',subjectId:'visitor'};
  assert.equal((await m.get(customer,{id:old.id})).evidenceStatus,'verified');
  await m.feedback(customer,{id:old.id,value:'helpful'});
  const replacement = await m.create(p,{...input,supersedes:[old.id],evidenceBundleIds:['e']});
  assert.equal((await m.search(customer)).items.length,1);
  await m.publish(p,{id:replacement.id});
  assert.deepEqual((await m.search(customer)).items.map(x=>x.id),[replacement.id]);
  advance();
  await assert.rejects(m.get(customer,{id:replacement.id}),{status:404});
  await assert.rejects(m.publish(p,{id:replacement.id}),{status:409});
  assert.equal((await m.get(p,{id:replacement.id})).evidenceStatus,'expired');
});
test('routes and bound pagination', async()=>{
  const {module:m,p,input} = fixture();
  assert.equal(await m.handle({path:'/v1/other'}),null);
  assert.equal((await m.handle({path:'/v1/knowledge',method:'DELETE'})).status,405);
  for(let i=0;i<2;i++) assert.equal((await m.handle({path:'/v1/knowledge',method:'POST',principal:p,body:input})).status,201);
  const page = await m.search(p,{limit:1}); assert.ok(page.nextCursor);
  assert.equal((await m.search(p,{limit:1,cursor:page.nextCursor})).items.length,1);
  await assert.rejects(m.search({...p,conversationId:'c2'},{limit:1,cursor:page.nextCursor}),{status:400});
  assert.equal((await m.handle({path:'/v1/knowledge',method:'GET',principal:p,query:{locale:'zh',text:'上传',limit:'1'}})).body.items.length,1);
});
