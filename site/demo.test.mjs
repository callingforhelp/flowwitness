import test from 'node:test';
import assert from 'node:assert/strict';
import { initialState, transition, answer } from './demo.mjs';
const ask = s => answer(s, 'How do I export a report?', 'admin');
test('v1 answers only with verified matching evidence', () => {
 assert.deepEqual(ask(initialState()).steps, ['project', 'data', 'export']);
 assert.equal(ask({...initialState(), release:'v2'}).kind, 'unavailable');
});
test('release change suppresses stale steps', () => {
 const s = transition(initialState(), 'release-v2');
 assert.equal(s.status, 'stale'); assert.deepEqual(ask(s).steps, []);
});
test('failed replay withholds steps, approved successful replay restores v2', () => {
 const failed = transition(transition(initialState(), 'release-v2'), 'fail');
 assert.equal(failed.status, 'unavailable'); assert.deepEqual(ask(failed).steps, []);
 const passed = transition(failed, 'approve-and-pass');
 assert.equal(passed.evidenceVersion, 'v2'); assert.equal(ask(passed).version, 'v2');
 assert.deepEqual(ask(passed).steps, ['project','data','menu','export']);
});
test('unknown intent and wrong role never disclose instructions', () => {
 for (const q of ['', 'delete report', 'do not export a report', 'export all private data']) {
  assert.deepEqual(answer(initialState(), q, 'admin'), {kind:'clarify', steps:[]});
 }
 assert.deepEqual(answer(initialState(), '导出报告', 'viewer'), {kind:'role', steps:[]});
 assert.equal(answer(initialState(), '如何导出报告？', 'admin').kind, 'verified');
});
test('reset restores initial state', () => assert.deepEqual(transition({release:'v2'}, 'reset'), initialState()));
