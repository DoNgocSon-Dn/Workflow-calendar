import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const source = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
function worker(origin, network = async () => new Response('fresh')) {
  const handlers = {}, removed = [], stored = [], navigated = [];
  let unregistered = false;
  const context = {
    URL, Response, Intl, Boolean,
    self: {
      location: new URL(origin), addEventListener: (name, handler) => { handlers[name] = handler; },
      skipWaiting: async () => {},
      registration: { unregister: async () => { unregistered = true; } },
      clients: { claim: async () => {}, matchAll: async () => [{ url: `${origin}/calendar`, navigate: async url => { navigated.push(url); } }] },
    },
    caches: {
      keys: async () => ['workflow-cache-v1', 'unrelated-cache'],
      delete: async name => { removed.push(name); },
      match: async () => new Response('stale HTML', { headers: { 'content-type': 'text/html' } }),
      open: async () => ({ put: async (...args) => { stored.push(args); }, addAll: async () => {} }),
    },
    fetch: network,
  };
  runInNewContext(source, context);
  return { handlers, context, removed, stored, navigated, get unregistered() { return unregistered; } };
}
test('native APK never serves a cached web shell or intercepts bundled chunks', () => {
  const w = worker('https://localhost');
  let response;
  w.handlers.fetch({ request: { method: 'GET', url: 'https://localhost/main-new.js' }, respondWith: value => { response = value; } });
  assert.equal(response, undefined);
});
test('native migration unregisters the old worker and reloads only its own app windows', async () => {
  const w = worker('https://localhost');
  let completed;
  w.handlers.activate({ waitUntil: promise => { completed = promise; } });
  await completed;
  assert.equal(w.unregistered, true);
  assert.deepEqual(w.removed, ['workflow-cache-v1']);
  assert.deepEqual(w.navigated, ['https://localhost/calendar']);
});
test('online web navigation gets current HTML instead of the previous deployment', async () => {
  const w = worker('https://workflow-calendar.vercel.app');
  let response;
  w.handlers.fetch({ request: { method: 'GET', url: 'https://workflow-calendar.vercel.app/calendar', mode: 'navigate' }, respondWith: value => { response = value; } });
  assert.equal(await (await response).text(), 'fresh');
  assert.equal(w.stored[0][0], '/');
});
test('a failed chunk request never falls back to an HTML document', async () => {
  const w = worker('https://workflow-calendar.vercel.app', async () => { throw new Error('offline'); });
  w.context.caches.match = async () => undefined;
  let response;
  w.handlers.fetch({ request: { method: 'GET', url: 'https://workflow-calendar.vercel.app/main-new.js', destination: 'script' }, respondWith: value => { response = value; } });
  await assert.rejects(response, /offline/);
});
test('cloud API and runtime config requests bypass static caches', () => {
  const w = worker('https://workflow-calendar.vercel.app');
  for (const url of ['https://backend.example/api/events', 'https://workflow-calendar.vercel.app/api/events', 'https://workflow-calendar.vercel.app/runtime-config.js']) {
    let intercepted = false;
    w.handlers.fetch({ request: { method: 'GET', url }, respondWith: () => { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});
