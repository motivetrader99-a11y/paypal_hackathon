import { generateKeyPairSync, sign, verify } from 'node:crypto';
import { askJson } from './ai.js';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const COLORS = ['black', 'white', 'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink', 'grey', 'gray', 'brown'];

export function parseWithRules(text) {
  const lower = text.toLowerCase();
  const size = lower.match(/size\s+(xs|s|m|l|xl)\b/)?.[1]?.toUpperCase() ?? null;
  const maxPrice = Number(lower.match(/(?:under|below|max(?:imum)?|up to)\s*\$?\s*(\d+(?:\.\d+)?)/)?.[1] ?? NaN);
  const color = COLORS.find((c) => new RegExp(`\\b${c}\\b`).test(lower)) ?? null;
  const item = lower.match(new RegExp(`${color ?? ''}\\s*([a-z ]+?)(?:,|\\s+size|\\s+under)`))?.[1]?.trim() ?? 'item';
  return { item, color, size, maxPrice: Number.isFinite(maxPrice) ? maxPrice : null };
}

export async function parseMandate(text) {
  const ai = await askJson(
    'Turn a shopper instruction into purchase rules. Keys: item (string), color (lowercase string or null), size (string or null), maxPrice (number or null). Use only what the shopper stated.',
    text,
  );
  const valid = ai && typeof ai.item === 'string' && (ai.maxPrice === null || typeof ai.maxPrice === 'number');
  return { rules: valid ? ai : parseWithRules(text), source: valid ? 'ai' : 'rules' };
}

const payload = (m) => Buffer.from(JSON.stringify({ text: m.text, rules: m.rules }));

export function signMandate(text, rules) {
  const m = { text, rules };
  m.signature = sign(null, payload(m), privateKey).toString('base64');
  return m;
}

export const verifyMandate = (m) => verify(null, payload(m), publicKey, Buffer.from(m.signature, 'base64'));

/** The hard limits. Runs before any money moves and does not depend on AI. */
export function checkPurchase(mandate, listing) {
  const violations = [];
  const unverified = [];
  const { rules } = mandate;
  if (!verifyMandate(mandate)) violations.push('The signed instruction was altered.');
  if (rules.maxPrice != null && listing.price > rules.maxPrice) {
    violations.push(`Price $${listing.price} is over the $${rules.maxPrice} limit.`);
  }
  if (rules.size && listing.size !== rules.size) violations.push(`Size ${listing.size} is not the requested ${rules.size}.`);
  if (rules.color) {
    const c = listing.color.toLowerCase();
    if (COLORS.includes(c) && c !== rules.color) violations.push(`Color ${c} is not the requested ${rules.color}.`);
    else if (!COLORS.includes(c)) unverified.push(`The store calls the color "${listing.color}", which the gate cannot confirm is ${rules.color}.`);
  }
  return { allowed: violations.length === 0, violations, unverified };
}
