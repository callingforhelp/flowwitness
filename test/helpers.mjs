import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {startServer} from '../src/server.mjs';
export async function fixture(t,options={}){const root=await fs.mkdtemp(path.join(os.tmpdir(),'flowwitness-'));const app=await startServer({root,port:0,...options});t.after(async()=>{await app.close();await fs.rm(root,{recursive:true,force:true});});const call=async(p,method='GET',body,headers={})=>{const r=await fetch(app.config.origin+p,{method,headers:{'x-flowwitness-client':'cli','content-type':'application/json',...headers},...(body?{body:JSON.stringify(body)}:{})});const data=r.headers.get('content-type')?.includes('application/json')?await r.json():await r.arrayBuffer();return {status:r.status,data};};return {app,call,root};}
export async function waitJob(call,id){const end=Date.now()+100000;while(Date.now()<end){const {data}=await call('/v1/jobs/'+id);if(!['queued','running'].includes(data.job.status))return data.job;await new Promise(r=>setTimeout(r,100));}throw new Error('Job did not complete');}
