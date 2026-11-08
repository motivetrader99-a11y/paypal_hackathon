const money = (v) => ({ currency_code: 'USD', value: Number(v).toFixed(2) });
const live = () => Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
const base = () => process.env.PAYPAL_BASE || 'https://api-m.sandbox.paypal.com';
let n = 0;
const fake = (p) => `SIM-${p}-${(++n).toString().padStart(4, '0')}`;

async function token() {
  const auth = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString('base64');
  const res = await fetch(`${base()}/v1/oauth2/token`, {
    method: 'POST',
    headers: { authorization: `Basic ${auth}`, 'content-type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`PayPal sign-in failed (${res.status}). Check your sandbox client ID and secret.`);
  return (await res.json()).access_token;
}

async function call(path, body, requestId) {
  const res = await fetch(`${base()}${path}`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${await token()}`,
      'content-type': 'application/json',
      prefer: 'return=representation',
      ...(requestId ? { 'paypal-request-id': requestId } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`PayPal ${path} failed (${res.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

export const mode = () => (live() ? 'sandbox' : 'simulated');

/** Reserves the shopper's limit. The buyer approves once; the agent can never exceed it. */
export async function createHold(amount, description, returnUrl, cancelUrl, requestId) {
  if (!live()) return { orderId: fake('ORDER'), approveUrl: null };
  const order = await call('/v2/checkout/orders', {
    intent: 'AUTHORIZE',
    purchase_units: [{ description: description.slice(0, 127), amount: money(amount) }],
    payment_source: { paypal: { experience_context: { return_url: returnUrl, cancel_url: cancelUrl, user_action: 'CONTINUE' } } },
  }, requestId);
  const approveUrl = order.links.find((l) => l.rel === 'payer-action' || l.rel === 'approve')?.href;
  return { orderId: order.id, approveUrl };
}

export async function authorize(orderId) {
  if (!live()) return { authorizationId: fake('AUTH') };
  const o = await call(`/v2/checkout/orders/${orderId}/authorize`, {});
  return { authorizationId: o.purchase_units[0].payments.authorizations[0].id };
}

export async function capture(authorizationId, amount, requestId) {
  if (!live()) return { captureId: fake('CAPTURE'), status: 'COMPLETED' };
  const c = await call(`/v2/payments/authorizations/${authorizationId}/capture`, { amount: money(amount), final_capture: true }, requestId);
  return { captureId: c.id, status: c.status };
}

export async function voidHold(authorizationId) {
  if (!live()) return { status: 'VOIDED' };
  await call(`/v2/payments/authorizations/${authorizationId}/void`);
  return { status: 'VOIDED' };
}

export async function refund(captureId, amount, requestId) {
  if (!live()) return { refundId: fake('REFUND'), status: 'COMPLETED' };
  const r = await call(`/v2/payments/captures/${captureId}/refund`, { amount: money(amount) }, requestId);
  return { refundId: r.id, status: r.status };
}
