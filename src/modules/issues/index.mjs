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

export function createModule({ repository, artifacts, config = {} } = {}) {
  const now = config.now ?? Date.now;
  async function read(scope, collection, id) {
    string(id, 'id');
    if (!repository?.get) throw unavailable();
    const item = await repository.get(scope, collection, id);
    if (!item || item.application !== scope.application || item.conversationId !== scope.conversationId) throw notFound();
    return item;
  }
  function locale(value) { if (!['en','zh'].includes(value)) throw invalid('Invalid locale'); return value; }
  async function create(p, input) {
    const scope = scopeOf(p, ['operator','customer']);
    fields(input, ['title','description','locale']);
    return repository.create(scope, 'issues', {title:string(input.title,'title',500),description:string(input.description,'description',20000),locale:locale(input.locale),status:'open',createdBy:p.subjectId});
  }
  async function get(p, input) {
    const scope = scopeOf(p);
    fields(input, ['id']);
    const item = await read(scope,'issues',input.id);
    const messages = []; let cursor = null;
    do {
      const page = await repository.query(scope,'messages',{where:{issueId:item.id},limit:100,cursor});
      messages.push(...page.items.filter(m => m.application === scope.application && m.conversationId === scope.conversationId && m.issueId === item.id));
      if (page.nextCursor && page.nextCursor === cursor) throw unavailable();
      cursor = page.nextCursor;
    } while (cursor);
    return {...item,messages};
  }
  async function list(p,input = {}) { return repository.query(scopeOf(p),'issues',query(input)); }
  async function addMessage(p,input) {
    const scope = scopeOf(p);
    fields(input,['id','text','locale','artifactIds']);
    await read(scope,'issues',input.id);
    const artifactIds = assertStringArray(input.artifactIds ?? [],'artifactIds');
    for (const id of artifactIds) {
      if (!artifacts?.get) throw unavailable();
      const artifact = await artifacts.get(scope,id);
      if (!artifact || artifact.revokedAt || Date.parse(artifact.expiresAt) <= Number(now())) throw notFound();
    }
    return repository.create(scope,'messages',{issueId:input.id,authorId:p.subjectId,authorRole:p.role,text:string(input.text,'text',20000),locale:locale(input.locale),artifactIds});
  }
  async function resolve(p,input) {
    const scope = scopeOf(p,['operator']);
    fields(input,['id','expectedVersion','resolutionEntryId']);
    if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) throw invalid('Expected version required');
    const issue = await read(scope,'issues',input.id);
    if (issue.version !== input.expectedVersion) throw conflict();
    const entry = await read(scope,'knowledgeEntries',input.resolutionEntryId);
    if (entry.kind !== 'resolution' || entry.issueId !== issue.id) throw invalid('Matching resolution required');
    return repository.update(scope,'issues',issue.id,{expectedVersion:input.expectedVersion,patch:{status:'resolved',resolutionEntryId:entry.id}});
  }
  async function handle(ctx) {
    const match = /^\/v1\/issues\/([^/]+)(?:\/(messages|resolve))?$/.exec(ctx.path);
    if (ctx.path !== '/v1/issues' && !match) return null;
    try {
      if (ctx.path === '/v1/issues') {
        if (ctx.method === 'POST') return {status:201,body:{item:await create(ctx.principal,ctx.body)}};
        if (ctx.method === 'GET') return {status:200,body:await list(ctx.principal,ctx.query)};
      } else {
        let id; try { id = decodeURIComponent(match[1]); } catch { throw invalid('Invalid id'); }
        if (!match[2] && ctx.method === 'GET') return {status:200,body:{item:await get(ctx.principal,{id})}};
        if (match[2] && ctx.method === 'POST') return {status:match[2] === 'messages' ? 201 : 200,body:{item:await (match[2] === 'messages' ? addMessage : resolve)(ctx.principal,{...object(ctx.body),id})}};
      }
      return methodError(ctx.requestId);
    } catch (error) { return responseError(error,ctx.requestId); }
  }
  return {create,get,list,addMessage,resolve,handle};
}
