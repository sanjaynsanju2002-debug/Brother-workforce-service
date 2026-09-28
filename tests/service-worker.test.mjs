// Run with: node --test tests/service-worker.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../frontend/public/sw.js', import.meta.url), 'utf8');
function worker() {
  const handlers = {};
  const matches = [];
  vm.runInNewContext(source, {
    URL, Response,
    self: { location: { origin: 'https://example.test' }, addEventListener: (name, fn) => { handlers[name] = fn; } },
    fetch: async () => { throw new Error('offline'); },
    caches: { open: async () => ({ match: async (path) => { matches.push(path); return new Response(path); } }) },
  });
  return { handlers, matches };
}
test('private requests and submissions bypass the offline cache', () => {
  const { handlers } = worker();
  for (const [path, method, mode] of [
    ['/api/jobs', 'GET', 'cors'],
    ['/api/workers/123/resume?pin=secret', 'GET', 'navigate'],
    ['/api/workers', 'POST', 'cors'],
    ['/api/admin/workers', 'GET', 'cors'],
    ['https://other.test/private', 'GET', 'navigate'],
  ]) {
    handlers.fetch({ request: { url: new URL(path, 'https://example.test').href, method, mode },
      respondWith: () => assert.fail(`Intercepted ${path}`) });
  }
});
test('offline navigation shows app home or a connection notice, never cached records', async () => {
  const { handlers, matches } = worker();
  for (const [path, expected] of [['/app', '/app.html'], ['/admin', '/offline.html'], ['/', '/offline.html']]) {
    let response;
    handlers.fetch({ request: { url: `https://example.test${path}`, method: 'GET', mode: 'navigate' }, respondWith: value => { response = value; } });
    assert.equal(await (await response).text(), expected);
  }
  assert.deepEqual(matches, ['/app.html', '/offline.html', '/offline.html']);
});
