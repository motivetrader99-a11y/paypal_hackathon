import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Ledger } from '../src/ledger.js';
import { parseWithRules, signMandate, checkPurchase } from '../src/mandate.js';
import { startRun, continueRun, fileClaim, tamper } from '../src/engine.js';

const noCreds = () => { for (const k of ['PAYPAL_CLIENT_ID', 'PAYPAL_CLIENT_SECRET', 'ANTHROPIC_API_KEY', 'PAYPAL_BASE', 'ANTHROPIC_BASE', 'GEMINI_API_KEY', 'GEMINI_BASE']) delete process.env[k]; };
const types = (r) => r.ledger.entries.map((e) => e.type);

test('ledger detects an edited entry', () => {
  const l = new Ledger(); l.append('a', { x: 1 }); l.append('b', { x: 2 });
  assert.equal(l.verify().ok, true);
  l.entries[0].data.x = 9;
  assert.deepEqual(l.verify(), { ok: false, brokenAt: 1 });
});

test('instruction is parsed into rules', () => {
  assert.deepEqual(parseWithRules('Blue rain jacket, size M, under $60, by Friday'), { item: 'rain jacket', color: 'blue', size: 'M', maxPrice: 60 });
});

test('gate rejects a mandate altered after signing', () => {
  const m = signMandate('x', { color: 'blue', size: 'M', maxPrice: 60 });
  m.rules.maxPrice = 500;
  assert.equal(checkPurchase(m, { price: 74, size: 'M', color: 'blue' }).allowed, false);
});

test('injection is blocked and the hold is released', async () => {
  noCreds();
  const r = await startRun('injection', 'http://t');
  assert.equal(r.status, 'blocked');
  assert.ok(types(r).includes('hold_voided'));
  assert.ok(!types(r).includes('payment'));
});

for (const [id, fault, status] of [['agentError', 'agent', 'refunded'], ['merchantFault', 'merchant', 'refunded'], ['buyerRemorse', 'buyer', 'denied']]) {
  test(`${id} is ruled ${fault}`, async () => {
    noCreds();
    const r = await fileClaim(await startRun(id, 'http://t'));
    assert.equal(r.verdict.fault, fault);
    assert.equal(r.status, status);
    assert.equal(r.ledger.verify().ok, true);
  });
}

test('tampered record is refused and nothing is refunded', async () => {
  noCreds();
  const r = await fileClaim(tamper(await startRun('agentError', 'http://t')));
  assert.equal(r.status, 'refused');
  assert.ok(!types(r).includes('refund'));
});

function fake(handler) {
  return new Promise((ok) => {
    const calls = [];
    const s = createServer(async (req, res) => {
      let b = ''; for await (const c of req) b += c;
      calls.push({ path: req.url, body: b ? JSON.parse(b.startsWith('{') ? b : '{}') : null, headers: req.headers });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(handler(req.url, s)));
    }).listen(0, () => ok({ s, calls, url: `http://localhost:${s.address().port}` }));
  });
}

const paypalReplies = (u) => {
  if (u.endsWith('/token')) return { access_token: 't' };
  if (u.endsWith('/authorize')) return { purchase_units: [{ payments: { authorizations: [{ id: 'A1' }] } }] };
  if (u.endsWith('/orders')) return { id: 'O1', links: [{ rel: 'payer-action', href: 'https://pp/approve' }] };
  if (u.endsWith('/capture')) return { id: 'C1', status: 'COMPLETED' };
  if (u.endsWith('/refund')) return { id: 'R1', status: 'COMPLETED' };
  return {};
};

test('sandbox flow makes the expected PayPal calls', async () => {
  noCreds();
  const { s, calls, url } = await fake(paypalReplies);
  Object.assign(process.env, { PAYPAL_CLIENT_ID: 'i', PAYPAL_CLIENT_SECRET: 's', PAYPAL_BASE: url });
  try {
    const r = await startRun('agentError', 'http://t');
    assert.equal(r.status, 'awaiting_approval');
    assert.equal(r.approveUrl, 'https://pp/approve');
    await continueRun(r);
    await fileClaim(r);
    const posts = calls.filter((c) => !c.path.endsWith('/token'));
    assert.deepEqual(posts.map((c) => c.path), ['/v2/checkout/orders', '/v2/checkout/orders/O1/authorize', '/v2/payments/authorizations/A1/capture', '/v2/payments/captures/C1/refund']);
    assert.equal(posts[0].body.purchase_units[0].amount.value, '60.00');
    assert.equal(posts[2].body.amount.value, '54.00');
    assert.equal(posts[3].body.amount.value, '54.00');
    assert.ok(posts[3].headers['paypal-request-id']);
  } finally { s.close(); noCreds(); }
});

const gemini = (obj) => (u) => (u.includes('generateContent') ? { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] } : {});

test('Gemini shopper can decline, and the hold is released', async () => {
  noCreds();
  const { s, calls, url } = await fake(gemini({ buy: false, reasoning: 'Not sure.' }));
  Object.assign(process.env, { GEMINI_API_KEY: 'k', GEMINI_BASE: url });
  try {
    const r = await startRun('agentError', 'http://t');
    assert.equal(r.status, 'declined');
    assert.ok(types(r).includes('hold_voided'));
    assert.equal(calls[0].headers['x-goog-api-key'], 'k');
    assert.match(calls[0].path, /gemini-3\.1-flash-lite:generateContent/);
  } finally { s.close(); noCreds(); }
});

test('agent page view excludes the photo and AI ruling refunds when it agrees', async () => {
  noCreds();
  const { s, calls, url } = await fake(gemini({ buy: true, reasoning: 'Fits.', item: 'jacket', color: 'blue', size: 'M', maxPrice: 60, fault: 'agent', decision: 'refund', cited: [1, 5] }));
  Object.assign(process.env, { GEMINI_API_KEY: 'k', GEMINI_BASE: url });
  try {
    const r = await fileClaim(await startRun('agentError', 'http://t'));
    assert.equal(r.status, 'refunded');
    assert.equal(r.verdict.source, 'ai');
    assert.ok(!calls[1].body.contents[0].parts[0].text.includes('green'));
  } finally { s.close(); noCreds(); }
});

test('AI ruling that contradicts the facts moves no money', async () => {
  noCreds();
  const { s, url } = await fake((u) => u.includes('messages')
    ? { content: [{ text: '{"fault":"merchant","decision":"refund","cited":[1],"reasoning":"x"}' }] } : {});
  Object.assign(process.env, { ANTHROPIC_API_KEY: 'k', ANTHROPIC_BASE: url });
  try {
    const r = await startRun('buyerRemorse', 'http://t').catch((e) => { throw e; });
    await fileClaim(r);
    assert.equal(r.status, 'review');
    assert.ok(!types(r).includes('refund'));
  } finally { s.close(); noCreds(); }
});
