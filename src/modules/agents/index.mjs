import { principalScope } from '../../platform/jobs.mjs';
import { invalid, forbidden, notFound, unavailable, conflict } from '../../platform/errors.mjs';
import { assertShortString as string, assertStringArray, assertReference } from '../../platform/records.mjs';

function scopeOf(p, roles) {
  const scope = principalScope(p, roles);
  if (p.role === 'operator' && p.conversationId === undefined) throw forbidden();
  return scope;
}
function object(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalid('Object required');
  return input;
}
function fields(input, allowed) {
  object(input);
  if (Object.keys(input).some(key => !allowed.includes(key))) throw invalid('Unsupported field');
}
function query(input = {}) {
  fields(input, ['where', 'text', 'limit', 'cursor']);
  const limit = input.limit === undefined ? 50 : Number(input.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw invalid('Invalid limit');
  return { ...input, limit };
}
function responseError(error, requestId) {
  const errors = {400:['invalid_request','Invalid request'],401:['unauthenticated','Authentication required'],403:['forbidden','Access denied'],404:['not_found','Record not found'],409:['conflict','Conflict'],429:['quota','Quota exceeded'],503:['unavailable','Adapter unavailable']};
  const status = errors[error?.status] ? error.status : 503;
  const [code,message] = errors[status];
  return {status,body:{error:{code,message},requestId}};
}
const methodError = requestId => ({status:405,body:{error:{code:'method_not_allowed',message:'Method not allowed'},requestId}});

export function createModule({ repository, jobs, config = {} } = {}) {
  const now = config.now ?? Date.now;
  async function read(scope,collection,id) {
    string(id,'id');
    if (!repository?.get) throw unavailable();
    const item = await repository.get(scope,collection,id);
    if (!item || item.application !== scope.application || item.conversationId !== scope.conversationId) throw notFound();
    return item;
  }
  async function call(name,p,input) {
    if (!jobs?.[name]) throw unavailable();
    return jobs[name](p,input);
  }
  async function register(p,input) {
    const scope = scopeOf(p,['operator']);
    fields(input,['ownerId','runtime','capabilities','enabled']);
    if (!['claude-code','codex','pi'].includes(input.runtime)) throw invalid('Invalid runtime');
    if (input.enabled !== undefined && typeof input.enabled !== 'boolean') throw invalid('Invalid enabled');
    return repository.create(scope,'agentCapabilities',{ownerId:string(input.ownerId,'ownerId'),runtime:input.runtime,capabilities:assertStringArray(input.capabilities,'capabilities'),enabled:input.enabled ?? true,lastSeenAt:new Date(now()).toISOString()});
  }
  async function list(p,input = {}) { return repository.query(scopeOf(p,['operator']),'agentCapabilities',query(input)); }
  async function investigate(p,input) {
    const scope = scopeOf(p,['operator']);
    fields(input,['issueId','requiredCapabilities','idempotencyKey']);
    await read(scope,'issues',input.issueId);
    return call('enqueue',p,{kind:'investigation',inputRef:{collection:'issues',id:input.issueId},requiredCapabilities:assertStringArray(input.requiredCapabilities ?? ['investigation'],'requiredCapabilities'),idempotencyKey:string(input.idempotencyKey,'idempotencyKey')});
  }
  async function getInvestigation(p,input) {
    const scope = scopeOf(p,['operator','agent']);
    fields(input,['id']);
    const job = await read(scope,'investigationJobs',input.id);
    if (job.kind !== 'investigation') throw notFound();
    return call('get',p,{id:input.id});
  }
  async function registered(p,capabilities = []) {
    const scope = scopeOf(p,['agent']);
    const page = await repository.query(scope,'agentCapabilities',{where:{ownerId:p.subjectId,enabled:true},limit:100});
    const records = page.items.filter(x => x.application === scope.application && x.conversationId === scope.conversationId && x.ownerId === p.subjectId && x.enabled);
    if (!records.length || capabilities.some(c => !records.some(x => x.capabilities.includes(c)))) throw forbidden();
    return scope;
  }
  async function claim(p,input = {}) {
    fields(input,['capabilities']);
    const capabilities = assertStringArray(input.capabilities ?? [],'capabilities');
    await registered(p,capabilities);
    return call('claim',p,{capabilities});
  }
  async function leased(p,input) {
    const scope = await registered(p);
    const job = await read(scope,'investigationJobs',input.id);
    if (job.kind !== 'investigation') throw notFound();
    string(input.token,'token');
    if (job.status !== 'leased' || job.lease?.ownerId !== p.subjectId || job.lease.token !== input.token || Date.parse(job.lease.expiresAt) <= Number(now()) || Date.parse(job.deadlineAt) <= Number(now()) || job.cancelRequestedAt) throw conflict();
    return scope;
  }
  async function heartbeat(p,input) { fields(input,['id','token']); await leased(p,input); return call('heartbeat',p,input); }
  async function complete(p,input) {
    fields(input,['id','token','resultRef']);
    const scope = await leased(p,input), resultRef = assertReference(input.resultRef,'resultRef');
    const result = await read(scope,resultRef.collection,resultRef.id);
    if (result.jobId !== input.id) throw invalid('Result does not belong to job');
    return call('complete',p,{id:input.id,token:input.token,resultRef});
  }
  async function fail(p,input) { fields(input,['id','token','errorCode']); await leased(p,input); return call('fail',p,{id:input.id,token:input.token,errorCode:string(input.errorCode,'errorCode',120)}); }
  async function cancel(p,input) {
    scopeOf(p,['operator','agent']); fields(input,['id']);
    const job = await getInvestigation(p,input);
    if (p.role === 'agent' && (job.status !== 'leased' || job.lease?.ownerId !== p.subjectId || Date.parse(job.lease.expiresAt) <= Number(now()))) throw forbidden();
    return call('cancel',p,{id:input.id});
  }
  async function handle(ctx) {
    const match = /^\/v1\/investigations\/([^/]+)(?:\/(heartbeat|complete|fail|cancel))?$/.exec(ctx.path);
    if (!['/v1/agents','/v1/investigations'].includes(ctx.path) && !match) return null;
    try {
      if (ctx.path === '/v1/agents') {
        if (ctx.method === 'POST') return {status:201,body:{item:await register(ctx.principal,ctx.body)}};
        if (ctx.method === 'GET') return {status:200,body:await list(ctx.principal,ctx.query)};
      } else if (ctx.path === '/v1/investigations') {
        if (ctx.method === 'POST') return {status:202,body:{job:await investigate(ctx.principal,ctx.body)}};
      } else if (match[1] === 'claim' && !match[2]) {
        if (ctx.method === 'POST') return {status:200,body:{job:await claim(ctx.principal,ctx.body)}};
      } else {
        let id; try { id = decodeURIComponent(match[1]); } catch { throw invalid('Invalid id'); }
        if (!match[2] && ctx.method === 'GET') return {status:200,body:{item:await getInvestigation(ctx.principal,{id})}};
        if (match[2] && ctx.method === 'POST') return {status:200,body:{item:await ({heartbeat,complete,fail,cancel}[match[2]])(ctx.principal,{...object(ctx.body),id})}};
      }
      return methodError(ctx.requestId);
    } catch(error) { return responseError(error,ctx.requestId); }
  }
  return {register,list,investigate,getInvestigation,claim,heartbeat,complete,fail,cancel,handle};
}
