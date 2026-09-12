import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createFFmpegRenderer } from '../src/adapters/ffmpeg/index.mjs';

const exec=promisify(execFile);
test('real FFmpeg ordered cuts, caption escaping, highlights, probe and cleanup',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'video-fixture-'));
  try {
    await exec('ffmpeg',['-nostdin','-v','error','-f','lavfi','-i','color=c=blue:s=160x120:r=10:d=1','-c:v','libx264','-pix_fmt','yuv420p',join(dir,'input.mp4')]);
    const bytes=await readFile(join(dir,'input.mp4'));
    const artifacts={async get(s,id){assert.equal(id,'source');return {id,size:bytes.length};},async read(){return bytes;}};
    const renderer=createFFmpegRenderer({artifacts,tempRoot:dir});
    assert.equal((await renderer.probe({}, {id:'source'})).durationMs,1000);
    const result=await renderer.render({source:{artifactId:'source'},trim:{startMs:0,endMs:1000},segments:[{startMs:500,endMs:1000},{startMs:0,endMs:500}],captions:[{startMs:0,endMs:800,text:"结果: '100%' %{evil}"}],highlights:[{startMs:0,endMs:600,x:0,y:0,width:0.5,height:0.5}]},{scope:{}});
    assert.equal(result.mediaType,'video/mp4'); assert.ok(result.bytes.length>0); assert.equal(result.durationMs,1000);
    await assert.rejects(renderer.render({source:{artifactId:'source'}},{scope:{},signal:AbortSignal.abort()}));
    assert.deepEqual(await readdir(dir),['input.mp4']);
  } finally {await rm(dir,{recursive:true,force:true});}
});
