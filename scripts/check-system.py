#!/usr/bin/env python3
"""Independent HTTP acceptance check. Requires installed Node/browser dependencies, Python 3."
Runs the actual server and Chromium against a temporary data directory. Never production.
"""
import base64
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]

def require(condition, message):
    if not condition:
        raise AssertionError(message)

class Harness:
    def __init__(self, data_dir, authenticated=False):
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            self.port = sock.getsockname()[1]
        self.url = f'http://127.0.0.1:{self.port}'
        self.admin = 'test-admin-' + 'a' * 40 if authenticated else None
        self.support = 'test-support-' + 's' * 40 if authenticated else None
        env = dict(os.environ, HOST='127.0.0.1', PORT=str(self.port), FLOWWITNESS_DATA_DIR=str(data_dir), FLOWWITNESS_ALLOWED_ORIGINS=self.url)
        for key in ['FLOWWITNESS_ADMIN_TOKEN','FLOWWITNESS_SUPPORT_TOKEN','FLOWWITNESS_WEBHOOK_SECRET']:
            env.pop(key, None)
        if authenticated:
            env.update(FLOWWITNESS_ADMIN_TOKEN=self.admin, FLOWWITNESS_SUPPORT_TOKEN=self.support)
        data_dir.mkdir(parents=True, exist_ok=True)
        self.log = tempfile.TemporaryFile()
        self.process = subprocess.Popen(['node', str(ROOT / 'bin/flowwitness.mjs'), 'serve'], cwd=data_dir, env=env, stdout=self.log, stderr=self.log)
        for _ in range(100):
            try:
                status, _ = self.call('/health')
                if status == 200:
                    return
            except OSError:
                pass
            if self.process.poll() is not None:
                self.log.seek(0)
                raise RuntimeError('Test server exited: ' + self.log.read().decode()[-2500:])
            time.sleep(.1)
        self.close()
        raise RuntimeError('Test server did not start')

    def call(self, path, method='GET', body=None, token='admin', extra_headers=None):
        headers = {'X-FlowWitness-Client':'cli'}
        credential = self.admin if token == 'admin' else self.support if token == 'support' else token
        if credential:
            headers['Authorization'] = 'Bearer ' + credential
        data = None
        if body is not None:
            headers['Content-Type'] = 'application/json'
            data = json.dumps(body).encode()
        if extra_headers:
            headers.update(extra_headers)
        request = urllib.request.Request(self.url + path, data=data, headers=headers, method=method)
        try:
            response = urllib.request.urlopen(request, timeout=15)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            raw = response.read()
            payload = json.loads(raw) if 'application/json' in response.headers.get('Content-Type','') else raw
            return response.status, payload

    def ok(self, path, method='GET', body=None, token='admin'):
        status, payload = self.call(path, method, body, token)
        require(200 <= status < 300, f'{method} {path} failed: {status} {payload}')
        return payload

    def verify(self):
        job = self.ok('/v1/workflows/export-report/verify', 'POST', {})['job']
        for _ in range(200):
            job = self.ok('/v1/jobs/' + job['id'])['job']
            if job['status'] not in ['queued','running']:
                return job
            time.sleep(.25)
        raise AssertionError('Browser job timed out')

    def query(self, **overrides):
        request = {'application':'demo-reports', 'question':'How do I export a report?', 'context':{'role':'admin','locale':'en'}}
        request.update(overrides)
        return self.ok('/v1/query','POST',request, token='support' if self.support else 'admin')

    def resolve_questions(self):
        for question in self.ok('/v1/questions')['questions']:
            if question['status'] == 'open':
                self.ok('/v1/questions/' + question['id'] + '/resolve','POST',{'answer':'Reviewed the seeded fixture change; updated steps match the test application.'})

    def close(self):
        self.process.terminate()
        try:
            self.process.wait(timeout=10)
        except subprocess.TimeoutExpired:
            self.process.kill()
            self.process.wait()
        self.log.close()


def main():
    with tempfile.TemporaryDirectory(prefix='flowwitness-acceptance-') as temp:
        h = Harness(Path(temp)/'data', authenticated=True)
        try:
            require(h.call('/v1/workflows', token=None)[0] == 401, 'Management allowed without auth')
            require(h.call('/v1/workflows', token='support')[0] == 403, 'Support can read management data')
            require(h.call('/v1/demo/setup','POST',{},token='support')[0] == 403, 'Support can mutate fixture')
            h.ok('/v1/demo/setup','POST',{})
            require(h.query()['status'] != 'answered', 'Unverified workflow answered')
            job = h.verify()
            require(job['status'] == 'passed', f'Real v1 replay failed: {job}')
            run = h.ok('/v1/runs/' + job['run_id'])['run']
            images = [step['artifact_id'] for step in run['steps'] if step.get('artifact_id')]
            require(images, 'No real step screenshot retained')
            status, image = h.call('/v1/artifacts/' + images[0])
            require(status == 200 and image.startswith(b'\x89PNG'), 'Screenshot not a PNG')
            require(h.query()['status'] != 'answered', 'Verification silently published')
            h.resolve_questions()
            h.ok('/v1/workflows/export-report/publish','POST',{'run_id':job['run_id']})
            answer = h.query()
            require(answer['status'] == 'answered' and answer['steps'] and answer['evidence'], 'Published query missing answer/evidence')
            require(answer['guidance']['execution_mode'] == 'instructions_only','Guidance claims execution')
            require(h.query(context={'role':'viewer','locale':'en'})['status'] != 'answered','Wrong role receives instructions')
            require(h.query(question='Delete everything')['status'] != 'answered','Unknown task answered')
            status, _ = h.call('/v1/query','POST',{'application':'another-app','question':'export','context':{'role':'admin'}},token='support')
            require(status in [400,403], 'Cross application query not denied')
            h.ok('/v1/demo/version','POST',{'version':'v2'})
            require(h.query()['status'] != 'answered','New release got old guidance')
            failed = h.verify()
            require(failed['status'] == 'failed', 'Old steps unexpectedly passed changed DOM')
            h.ok('/v1/demo/repair','POST',{})
            repaired = h.verify()
            require(repaired['status'] == 'passed',f'Repaired workflow failed: {repaired}')
            h.resolve_questions()
            h.ok('/v1/workflows/export-report/publish','POST',{'run_id':repaired['run_id']})
            require(h.query()['status'] == 'answered','Updated publication unavailable')
            require(h.query(question='导出报告',context={'role':'admin','locale':'zh-CN'})['status']=='answered','Chinese question failed')
            require(h.call('/v1/images','POST',{'image_base64':base64.b64encode(b'not an image').decode(),'consent':True})[0] in [400,415,422],'Invalid image accepted')
            print('PASS: real browser v1 / changed DOM failure / repaired v2; private PNG evidence; explicit publication; query, Chinese, role and auth boundaries')
        finally:
            h.close()

if __name__ == '__main__':
    main()
