import test from 'node:test';
import assert from 'node:assert/strict';
import { createModule } from '../src/modules/agents/index.mjs';
const op={application:'a',conversationId:'one',subjectId:'operator',role:'operator'};
const customer={...op,subjectId:'customer',role:'customer'};
const agent={...op,subjectId:'builder',role:'agent'};
const rejected=(fn,status)=>assert.rejects(fn,e=>e.status===status);
function fixture() {
 let seq=0; const records=[];
 const matches=(s,x)=>s.application===x.application && s.conversationId===x.conversationId;
 const repository={
 async create(s,c,x){const item={...x,...s,id:String(++seq),version:1,schemaVersion:1,createdAt:'2026-01-01T00:00:00.000Z',updatedAt:'2026-01-01T00:00:00.000Z'}; records.push({c,item});return structuredClone(item);},
 async get(s,c,id){return structuredClone(records.find(x=>x.c===c&&x.item.id===id&&matches(s,x.item))?.item??null);},
 async query(s,c,q={}){return {items:structuredClone(records.filter(x=>x.c===c&&matches(s,x.item)&&Object.entries(q.where??{}).every(([k,v])=>x.item[k]===v)).map(x=>x.item)),nextCursor:null};},
 async update(s,c,id,{expectedVersion,patch}){const x=records.find(x=>x.c===c&&x.item.id===id&&matches(s,x.item));if(!x)throw {status:404};if(x.item.version!==expectedVersion)throw {status:409};Object.assign(x.item,patch,{version:expectedVersion+1});return structuredClone(x.item);}
 };return {repository,records};
}

test('registered agents claim, renew, settle and cancel with scope and fencing',async()=>{
 const {repository,records}=fixture();let now=1000; const dedupe=new Map();
 const jobs={
 async enqueue(p,i){const key=JSON.stringify([p.application,p.conversationId,i.idempotencyKey]);if(dedupe.has(key)){const old=dedupe.get(key);if(old.inputRef.id!==i.inputRef.id)throw {status:409};return old;}const j=await repository.create(p,'investigationJobs',{...i,status:'queued',lease:null,deadlineAt:new Date(100000).toISOString()});dedupe.set(key,j);return j;},
 async get(p,{id}){return repository.get(p,'investigationJobs',id);},
 async claim(p,{capabilities}){const x=records.find(x=>x.c==='investigationJobs'&&x.item.application===p.application&&x.item.conversationId===p.conversationId&&x.item.status==='queued'&&x.item.requiredCapabilities.every(c=>capabilities.includes(c)));if(!x)return null;x.item.status='leased';x.item.lease={ownerId:p.subjectId,token:'fence',expiresAt:new Date(10000).toISOString()};return structuredClone(x.item);},
 async heartbeat(p,{id}){return (await this.get(p,{id})).lease;},
 async complete(p,{id}){const x=records.find(x=>x.item.id===id);x.item.status='succeeded';return structuredClone(x.item);},
 async fail(p,{id}){const x=records.find(x=>x.item.id===id);x.item.status='failed';return structuredClone(x.item);},
 async cancel(p,{id}){const x=records.find(x=>x.item.id===id);x.item.status='cancelled';x.item.lease=null;return structuredClone(x.item);}
 };
 const m=createModule({repository,jobs,config:{now:()=>now}});
 await rejected(()=>m.register(agent,{ownerId:'builder',runtime:'codex',capabilities:['investigation']}),403);
 await rejected(()=>m.claim(agent,{capabilities:['investigation']}),403);
 await m.register(op,{ownerId:'builder',runtime:'codex',capabilities:['investigation']});
 const issue=await repository.create(op,'issues',{title:'中文'}), input={issueId:issue.id,idempotencyKey:'retry'};
 await rejected(()=>m.investigate(customer,input),403);
 const job=await m.investigate(op,input);assert.equal(job.status,'queued');assert.equal((await m.investigate(op,input)).id,job.id);
 await rejected(()=>m.getInvestigation({...agent,conversationId:'two'},{id:job.id}),404);
 await rejected(()=>m.claim(agent,{capabilities:['admin']}),403);
 const claims=await Promise.all([m.claim(agent,{capabilities:['investigation']}),m.claim(agent,{capabilities:['investigation']})]);assert.equal(claims.filter(Boolean).length,1);
 assert.equal((await m.heartbeat(agent,{id:job.id,token:'fence'})).ownerId,'builder');
 const result=await repository.create(op,'knowledgeEntries',{jobId:job.id,summary:'Finding'}), completion={id:job.id,token:'fence',resultRef:{collection:'knowledgeEntries',id:result.id}};
 await rejected(()=>m.complete(op,completion),403);
 await rejected(()=>m.complete(agent,{...completion,token:'old'}),409);
 now=11000;await rejected(()=>m.complete(agent,completion),409);now=1000;
 assert.equal((await m.complete(agent,completion)).status,'succeeded');
 const second=await m.investigate(op,{...input,idempotencyKey:'second'});await m.claim(agent,{capabilities:['investigation']});
 await m.cancel(op,{id:second.id});await rejected(()=>m.fail(agent,{id:second.id,token:'fence',errorCode:'failed'}),409);
});
test('agent routing rejects wrong methods and hides adapter details',async()=>{
 const m=createModule({repository:{query(){throw {status:400,message:'private'};}}});
 assert.equal(await m.handle({path:'/v1/investigations/x/unknown'}),null);
 assert.equal((await m.handle({path:'/v1/investigations/claim',method:'GET',requestId:'r'})).status,405);
 const res=await m.handle({path:'/v1/agents',method:'GET',principal:op,requestId:'r'});assert.equal(res.status,400);assert.equal(res.body.requestId,'r');assert.ok(!JSON.stringify(res).includes('private'));
});
