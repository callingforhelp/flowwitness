import test from 'node:test';
import assert from 'node:assert/strict';
import { createModule } from '../src/modules/video/index.mjs';
import { normalizeEdit, resolveTiming } from '../src/modules/video/edit.mjs';

const operator = { application: 'app', conversationId: 'c1', subjectId: 'op', role: 'operator' };
function fixture() {
  let tick = 1000; let seq = 0; let plan;
  const rows = new Map(); const media = new Map(); const queue = new Map();
  const key = (s, c, id) => JSON.stringify([s.application, s.conversationId, c, id]);
  const repository = {
    async create(s, c, row) { const r = { schemaVersion: 1, ...s, version: 1, createdAt: new Date(tick).toISOString(), updatedAt: new Date(tick).toISOString(), ...row }; rows.set(key(s,c,r.id),r); return r; },
    async get(s,c,id) { return rows.get(key(s,c,id)) ?? null; },
    async update(s,c,id,{expectedVersion,patch}) { const r = await this.get(s,c,id); assert.equal(r.version,expectedVersion); const next = {...r,...patch,version:r.version+1}; rows.set(key(s,c,id),next); return next; },
  };
  const artifacts = {
    async get(s,id) { return media.get(key(s,'artifacts',id)) ?? null; },
    async put(s,input) { const j = queue.get(input.jobId); assert.equal(j.status,'leased'); assert.equal(input.leaseToken,'token'); const r = { id: `out${++seq}`, mediaType: input.mediaType, expiresAt: new Date(100000).toISOString() }; media.set(key(s,'artifacts',r.id),r); return r; },
    async revoke(s,id) { const r = await this.get(s,id); r.revokedAt = new Date(tick).toISOString(); return {revoked:true}; },
    async link(s,id) { assert.ok(!(await this.get(s,id)).revokedAt); return {url:`/delivery/${id}`,expiresAt:new Date(100000).toISOString()}; },
  };
  const jobs = {
    async enqueue(p,input) { const j = {id:`job${++seq}`,status:'queued',...input}; queue.set(j.id,j); return j; },
    async get(p,{id}) { return queue.get(id); },
    async heartbeat(p,{id,token}) { assert.equal(token,'token'); assert.equal(queue.get(id).status,'leased'); },
    async complete(p,{id}) { const j = queue.get(id); assert.equal(j.status,'leased'); j.status='succeeded'; return j; },
    async fail(p,{id}) { const j=queue.get(id); if(j.status!=='cancelled')j.status='failed'; return j; },
  };
  const renderer = { async probe() { return {durationMs:2000}; }, async render(p) { plan=p; return {bytes:Buffer.from('fake')}; } };
  const module = createModule({repository,artifacts,jobs,renderer,config:{now:()=>tick,idGenerator:()=>`vid${++seq}`}});
  const scope = {application:'app',conversationId:'c1'};
  media.set(key(scope,'artifacts','source'),{id:'source',kind:'recording',mediaType:'video/mp4',expiresAt:new Date(100000).toISOString()});
  media.set(key(scope,'artifacts','logo'),{id:'logo',mediaType:'image/png'});
  media.set(key(scope,'artifacts','voice'),{id:'voice',mediaType:'audio/wav'});
  return {module,repository,artifacts,jobs,renderer,queue,scope,get plan(){return plan;},expire(){tick=200000;}};
}

test('fake renderer preserves bilingual timeline, private output, publication and scoped access', async () => {
  for (const locale of ['en','zh']) {
    const f=fixture();
    await f.repository.create(f.scope,'evidenceBundles',{id:'bundle',status:'verified',artifactIds:['source'],expiresAt:new Date(100000).toISOString()});
    const edit = {trim:{startMs:0,endMs:2000},segments:[{startMs:1000,endMs:1500},{startMs:0,endMs:500}],captions:[{startMs:0,endMs:900,text:locale==='zh'?'检查结果':'Check result'}],logoArtifactId:'logo',narrationArtifactId:'voice',colors:{primary:'#123456',background:'#000000',text:'#ffffff'},highlights:[{startMs:10,endMs:800,x:0,y:0,width:0.5,height:0.5}]};
    const {item}=await f.module.create(operator,{locale,evidenceBundleId:'bundle',edit});
    await assert.rejects(f.module.get({...operator,application:'other'},{id:item.id}));
    await assert.rejects(f.module.get({...operator,role:'customer'},{id:item.id}));
    const {job}=await f.module.render(operator,{id:item.id,idempotencyKey:'render-key'}); job.status='leased';
    const done=await f.module.runRender(operator,{id:job.id,token:'token'});
    assert.equal(done.item.visibility,'private'); assert.deepEqual(f.plan.segments,edit.segments); assert.deepEqual(f.plan.captions,edit.captions); assert.deepEqual(f.plan.colors,edit.colors); assert.deepEqual(f.plan.highlights,edit.highlights); assert.equal(f.plan.logo.artifactId,'logo'); assert.equal(f.plan.narration.artifactId,'voice');
    await assert.rejects(f.module.publish({...operator,role:'agent'},{id:item.id}));
    const published=await f.module.publish(operator,{id:item.id}); assert.equal(published.item.visibility,'published');
    const updated=await f.module.update(operator,{id:item.id,expectedVersion:published.item.version,edit:{captions:[]}});
    assert.equal(updated.item.visibility,'private'); assert.ok((await f.artifacts.get(f.scope,done.output.id)).revokedAt);
    f.expire(); await assert.rejects(f.module.publish(operator,{id:item.id}));
  }
});

test('imports stay unverified; invalid refs, bounds and cancellation fail closed',async()=>{
  const f=fixture();
  await assert.rejects(f.module.create(operator,{locale:'en',sourceArtifactId:'https://host/video'}));
  await assert.rejects(f.module.create(operator,{locale:'en',sourceArtifactId:'source',status:'verified'}));
  assert.throws(()=>normalizeEdit({trim:'bad'}));
  assert.throws(()=>resolveTiming(normalizeEdit({trim:{startMs:0,endMs:3000}}),2000));
  const {item}=await f.module.create(operator,{locale:'en',sourceArtifactId:'source'}); assert.equal(item.evidenceStatus,'unverified');
  await assert.rejects(f.module.publish(operator,{id:item.id}));
  const {job}=await f.module.render(operator,{id:item.id,idempotencyKey:'cancel-key'}); job.status='leased';
  f.renderer.render=async()=>{job.status='cancelled';return {bytes:Buffer.from('late')};};
  await assert.rejects(f.module.runRender(operator,{id:job.id,token:'token'})); assert.equal(job.status,'cancelled');
  assert.equal((await f.module.get(operator,{id:item.id})).item.outputArtifactId,null);
  assert.equal(await f.module.handle({path:'/v1/issues',method:'GET'}),null);
  assert.equal((await f.module.handle({path:'/v1/videos',method:'DELETE'})).status,405);
});

test('render attachment CAS failure revokes output and fails before completion', async () => {
  const f = fixture();
  const { item } = await f.module.create(operator, { locale: 'en', sourceArtifactId: 'source' });
  const { job } = await f.module.render(operator, { id: item.id, idempotencyKey: 'cas-render' });
  job.status = 'leased';
  let output;
  const put = f.artifacts.put.bind(f.artifacts);
  f.artifacts.put = async (...args) => { output = await put(...args); return output; };
  f.jobs.complete = async () => assert.fail('must not complete before attachment');
  f.renderer.render = async () => {
    const current = await f.repository.get(f.scope, 'videoProjects', item.id);
    await f.repository.update(f.scope, 'videoProjects', item.id, { expectedVersion: current.version, patch: { locale: 'zh' } });
    return { bytes: Buffer.from('render') };
  };
  await assert.rejects(f.module.runRender(operator, { id: job.id, token: 'token' }));
  assert.equal(job.status, 'failed');
  assert.ok((await f.artifacts.get(f.scope, output.id)).revokedAt);
  assert.equal((await f.repository.get(f.scope, 'videoProjects', item.id)).outputArtifactId, null);
});
