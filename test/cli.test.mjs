import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const exec = promisify(execFile);
const cli = new URL('../bin/flowwitness.mjs', import.meta.url).pathname;
const token = 'cli-private-test-token';

async function run(args, url = 'http://127.0.0.1:1') {
  try {
    return {
      code: 0,
      ...await exec(process.execPath, [cli, ...args], {
        env: { ...process.env, FLOWWITNESS_URL: url, FLOWWITNESS_TOKEN: token },
      }),
    };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

test('help documents module, alias and existing commands', async () => {
  const result = await run(['--help']);
  assert.equal(result.code, 0);
  for (const command of ['serve', 'validate', 'impact', 'verify', 'query', 'module', 'api', '@file'])
    assert.ok(result.stdout.includes(command));
  assert.ok(!result.stdout.includes(token));
});

test('module GET/POST, file input, shortcuts and headers use configured server', async t => {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    requests.push({ path: req.url, method: req.method, headers: req.headers, body });
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ ok: true, reflectedToken: token }));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const url = `http://127.0.0.1:${server.address().port}`;
  const dir = await mkdtemp(join(tmpdir(), 'flowwitness-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'body.json');
  await writeFile(file, '{"title":"文件"}');
  for (const args of [
    ['module', 'GET', '/v1/knowledge?text=export%20report'],
    ['api', 'post', '/v1/issues', '{"title":"Report"}'],
    ['module', 'POST', '/v1/issues', '@' + file],
    ['module', 'POST', '/v1/issues', 'false'],
    ['issues'], ['knowledge'], ['agents'], ['investigation', 'job-1'],
    ['reproduction', 'request-1'], ['video', 'video-1'],
  ]) {
    const result = await run(args, url);
    assert.equal(result.code, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).ok, true);
    assert.match(result.stdout, /\n  "ok"/);
    assert.ok(!result.stdout.includes(token));
    assert.ok(!result.stderr.includes(token));
  }
  assert.equal(requests[0].path, '/v1/knowledge?text=export%20report');
  assert.equal(requests[0].body, '');
  assert.equal(requests[1].method, 'POST');
  assert.deepEqual(JSON.parse(requests[1].body), { title: 'Report' });
  assert.deepEqual(JSON.parse(requests[2].body), { title: '文件' });
  assert.equal(requests[3].body, 'false');
  for (const request of requests) {
    assert.equal(request.headers.authorization, 'Bearer ' + token);
    assert.equal(request.headers['x-flowwitness-client'], 'cli');
    assert.equal(request.headers['content-type'], 'application/json');
  }
});

test('invalid arguments fail locally without exposing input or token', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'flowwitness-cli-'));
  t.after(() => rm(dir, { recursive: true, force: true }));
  const file = join(dir, 'large.json');
  await writeFile(file, ' '.repeat(1024 * 1024 + 1));
  for (const args of [
    ['module'], ['module', 'GET'], ['module', 'DELETE', '/v1/issues'],
    ['module', 'GET', 'https://example.com/v1/issues'], ['module', 'GET', '//example.com/v1/issues'],
    ['module', 'GET', '/v1/workflows'], ['module', 'GET', '/v1/issues/../agents'],
    ['module', 'GET', '/v1/issues/%2e%2e'], ['module', 'GET', '/v1/issues/a%2fb'],
    ['module', 'GET', '/v1/issues#fragment'], ['module', 'GET', '/v1/issues/%zz'],
    ['module', 'GET', '/v1/issues', '{}'], ['module', 'POST', '/v1/issues', token],
    ['module', 'POST', '/v1/issues', '@/missing/' + token], ['module', 'POST', '/v1/issues', '@' + file],
    ['module', 'GET', '/v1/issues', '{}', 'extra'], ['video'], ['issues', 'extra'],
  ]) {
    const result = await run(args);
    assert.equal(result.code, 1, JSON.stringify(args));
    assert.ok(!result.stderr.includes('Cannot reach'), result.stderr);
    assert.ok(!result.stderr.includes(token));
    assert.equal(result.stdout, '');
  }
});
