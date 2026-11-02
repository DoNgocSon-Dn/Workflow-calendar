// Explicit opt-in only. Uses two designated QA accounts and retains their test history.
// Never provide a service-role key: auth, API, SQL RLS and Socket.IO use real user JWTs.
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import { io } from 'socket.io-client';
if (process.env.WF_LIVE_SOCIAL_TEST !== '1') throw new Error('Set WF_LIVE_SOCIAL_TEST=1 to run against designated QA accounts.');
const required = name => {
  const value = process.env[name];
  if (!value) throw new Error(`Missing ${name}`);
  return value;
};
const url = required('SUPABASE_URL'), key = required('SUPABASE_ANON_KEY');
const apiUrl = process.env.WF_SOCIAL_API_URL || 'http://127.0.0.1:3000';
const sockets = [], authClients = [];
let passed = 0;
const pass = name => { passed++; console.log(`PASS ${name}`); };
const wait = (socket, name, matches = () => true) => new Promise((resolve, reject) => {
  const onEvent = data => {
    if (!matches(data)) return;
    clearTimeout(timer); socket.off(name, onEvent); resolve(data);
  };
  const timer = setTimeout(() => { socket.off(name, onEvent); reject(new Error(`Timed out waiting for ${name}`)); }, 15000);
  socket.on(name, onEvent);
});
try {
  const users = [];
  for (const label of ['A', 'B']) {
    const email = required(`WF_SOCIAL_${label}_EMAIL`);
    if (!/workflow|[+.\-]qa[+.\-]/i.test(email)) throw new Error('Only explicitly named workflow/QA accounts may be used.');
    const auth = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
    authClients.push(auth);
    const { data, error } = await auth.auth.signInWithPassword({ email, password: required(`WF_SOCIAL_${label}_PASSWORD`) });
    if (error || !data.session) throw new Error(`QA ${label} sign-in failed (${error?.status ?? 'no session'}).`);
    const token = data.session.access_token;
    const call = async (path, method = 'GET', body, status = 200) => {
      const response = await fetch(`${apiUrl}/social${path}`, {
        method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(20000),
      });
      assert.equal(response.status, status, `${method} /social${path} status`);
      return response.json();
    };
    const socket = io(apiUrl, { auth: { token }, transports: ['websocket'], autoConnect: false, reconnection: false });
    sockets.push(socket);
    const ready = wait(socket, 'session:ready'); socket.connect(); await ready;
    users.push({ id: data.user.id, call, socket });
  }
  const [a, b] = users;
  assert.notEqual(a.id, b.id); pass('two real user sessions and authenticated private socket rooms');
  const codeA = (await a.call('/code')).code, codeB = (await b.call('/code')).code;
  assert.notEqual(codeA, codeB); assert.equal((await b.call('/code')).code, codeB);
  pass('distinct, stable share codes');
  const requestEvent = wait(b.socket, 'social:changed');
  let request = await a.call('/requests/code', 'POST', { code: codeB.toLowerCase() }, 201);
  await requestEvent;
  const incoming = (await b.call('')).incoming.find(r => r.profile.id === a.id);
  assert.equal(incoming.id, request.id); pass('code invitation reaches the recipient in realtime');
  await a.call(`/messages/${b.id}`, 'POST', { clientId: crypto.randomUUID(), body: '[QA] must be denied before acceptance' }, 403);
  pass('code alone cannot bypass friendship acceptance');
  const accepted = wait(a.socket, 'social:changed');
  await b.call(`/requests/${request.id}`, 'PATCH', { action: 'accept' }); await accepted;
  assert((await a.call('')).friends.some(f => f.profile.id === b.id)); pass('acceptance updates both users');
  const clientId = crypto.randomUUID(), body = '[QA 02/11] Tin thử A → B, nhận tức thời.';
  const atB = wait(b.socket, 'direct:message', m => m.clientId === clientId);
  const first = await a.call(`/messages/${b.id}`, 'POST', { clientId, body }, 201);
  assert.equal((await atB).id, first.id); pass('A to B message arrives on the real socket');
  const replyId = crypto.randomUUID();
  const atA = wait(a.socket, 'direct:message', m => m.clientId === replyId);
  const reply = await b.call(`/messages/${a.id}`, 'POST', { clientId: replyId, body: '[QA 02/11] B → A: đã nhận và trả lời.' }, 201);
  assert.equal((await atA).id, reply.id); pass('B to A reply arrives on the real socket');
  const receipt = wait(a.socket, 'direct:read', r => r.messageIds.includes(first.id));
  await b.call('/messages/read', 'POST', { messageIds: [first.id] }, 201);
  assert.equal((await receipt).readerId, b.id); pass('read receipt returns to the sender');
  assert.equal((await a.call(`/messages/${b.id}`, 'POST', { clientId, body }, 201)).id, first.id);
  assert.equal((await b.call(`/messages/${a.id}`)).messages.filter(m => m.id === first.id).length, 1);
  pass('uncertain send retry does not duplicate a message');
  b.socket.disconnect();
  const missed = await a.call(`/messages/${b.id}`, 'POST', { clientId: crypto.randomUUID(), body: '[QA 02/11] Tin gửi lúc B mất kết nối.' }, 201);
  const ready = wait(b.socket, 'session:ready'); b.socket.connect(); await ready;
  assert((await b.call(`/messages/${a.id}`)).messages.some(m => m.id === missed.id));
  pass('history recovers a message missed during disconnect');
  await b.call(`/blocks/${a.id}`, 'PUT', { blocked: true });
  await a.call(`/messages/${b.id}`, 'POST', { clientId: crypto.randomUUID(), body: '[QA] must be denied after block' }, 403);
  await a.call('/requests/code', 'POST', { code: codeB }, 404);
  pass('blocking prevents both messages and new code invitations');
  await b.call(`/blocks/${a.id}`, 'PUT', { blocked: false });
  request = await a.call('/requests/code', 'POST', { code: codeB }, 201);
  await b.call(`/requests/${request.id}`, 'PATCH', { action: 'accept' });
  pass('unblock and a newly accepted invitation restore normal chat');
  console.log(`RESULT ${passed} live checks passed. Only designated QA accounts were changed; test history retained.`);
} finally {
  sockets.forEach(socket => socket.disconnect());
  // Local sessions only; do not globally sign out the user's other devices.
  for (const client of authClients) await client.auth.signOut({ scope: 'local' });
}
