import test from 'node:test';
import assert from 'node:assert/strict';
import { createModule } from '../src/modules/issues/index.mjs';
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

test('bound bilingual issues, messages, references and CAS',async()=>{
 const {repository}=fixture(), m=createModule({repository});
 const issue=await m.create(customer,{title:'登录失败',description:'无法登录',locale:'zh'});
 assert.equal(issue.createdBy,'customer');
 for(const p of [{...customer,application:'b'},{...customer,conversationId:'two'},{...op,conversationId:null}]) await rejected(()=>m.get(p,{id:issue.id}),404);
 await rejected(()=>m.create({...customer,conversationId:null},{title:'x',description:'x',locale:'en'}),403);
 await rejected(()=>m.create(agent,{title:'x',description:'x',locale:'en'}),403);
 const msg=await m.addMessage(customer,{id:issue.id,text:'Still broken',locale:'en'});
 assert.equal(msg.authorId,customer.subjectId);assert.equal(msg.authorRole,'customer');
 await rejected(()=>m.addMessage(customer,{id:issue.id,text:'x',locale:'en',authorId:'operator'}),400);
 assert.equal((await m.get(customer,{id:issue.id})).messages[0].locale,'en');
 assert.equal((await m.list({...customer,conversationId:'two'})).items.length,0);
 const entry=await repository.create(op,'knowledgeEntries',{issueId:issue.id,kind:'resolution'});
 await rejected(()=>m.resolve(customer,{id:issue.id,expectedVersion:1,resolutionEntryId:entry.id}),403);
 assert.equal((await m.resolve(op,{id:issue.id,expectedVersion:1,resolutionEntryId:entry.id})).status,'resolved');
 await rejected(()=>m.resolve(op,{id:issue.id,expectedVersion:1,resolutionEntryId:entry.id}),409);
});
test('routing and sanitized errors',async()=>{
 const m=createModule({repository:{create(){throw new Error('secret credential');}}});
 assert.equal(await m.handle({path:'/unknown'}),null);
 assert.equal(await m.handle({path:'/v1/issues/x/unknown'}),null);
 assert.equal((await m.handle({path:'/v1/issues',method:'DELETE',requestId:'r'})).status,405);
 const res=await m.handle({path:'/v1/issues',method:'POST',principal:customer,body:{title:'x',description:'x',locale:'en'},requestId:'r'});
 assert.equal(res.status,503);assert.equal(res.body.requestId,'r');assert.ok(!JSON.stringify(res).includes('secret'));
 assert.equal((await m.handle({path:'/v1/issues',method:'POST',body:{},requestId:'r'})).status,401);
});
