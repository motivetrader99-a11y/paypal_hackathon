import { randomUUID } from 'node:crypto';
import { Ledger } from './ledger.js';
import { parseMandate, signMandate, checkPurchase } from './mandate.js';
import { judge } from './verdict.js';
import { scenarios } from './scenarios.js';
import * as paypal from './paypal.js';

const runs = new Map();
export const getRun = (id) => runs.get(id);

export function view(run) {
  const { ledger, ...rest } = run;
  return { ...rest, entries: ledger.entries, integrity: ledger.verify(), paypalMode: paypal.mode() };
}

export async function startRun(scenarioId, publicUrl) {
  const scenario = scenarios[scenarioId];
  if (!scenario) throw Object.assign(new Error('Choose one of the listed cases.'), { status: 400 });
  const run = { id: randomUUID(), scenarioId, status: 'starting', ledger: new Ledger(), approveUrl: null, verdict: null };
  runs.set(run.id, run);

  const { rules, source } = await parseMandate(scenario.instruction);
  run.mandate = signMandate(scenario.instruction, rules);
  run.ledger.append('mandate', { mandate: run.mandate, parsedBy: source });

  const hold = await paypal.createHold(rules.maxPrice, `Witness limit: ${rules.item}`,
    `${publicUrl}/paypal/return?run=${run.id}`, `${publicUrl}/paypal/cancel?run=${run.id}`, `hold-${run.id}`);
  run.orderId = hold.orderId;
  run.ledger.append('hold_created', { orderId: hold.orderId, limit: rules.maxPrice });

  if (hold.approveUrl) {
    run.approveUrl = hold.approveUrl;
    run.status = 'awaiting_approval';
    return run;
  }
  return continueRun(run);
}

export async function continueRun(run) {
  if (run.status !== 'awaiting_approval' && run.status !== 'starting') return run;
  run.status = 'running';
  run.approveUrl = null;
  const scenario = scenarios[run.scenarioId];
  const { authorizationId } = await paypal.authorize(run.orderId);
  run.ledger.append('hold_approved', { authorizationId });
  run.ledger.append('page_view', scenario.page);
  run.ledger.append('agent_decision', { listing: scenario.listing, reasoning: scenario.thought });

  const gate = checkPurchase(run.mandate, scenario.listing);
  run.ledger.append('gate', gate);
  if (!gate.allowed) {
    await paypal.voidHold(authorizationId);
    run.ledger.append('hold_voided', { authorizationId });
    run.status = 'blocked';
    return run;
  }
  const { captureId, status } = await paypal.capture(authorizationId, scenario.listing.price, `capture-${run.id}`);
  run.captureId = captureId;
  run.amount = scenario.listing.price;
  run.ledger.append('payment', { captureId, amount: run.amount, status });
  run.ledger.append('delivery', scenario.delivered);
  run.status = 'delivered';
  return run;
}

export async function fileClaim(run) {
  if (run.status !== 'delivered') throw Object.assign(new Error('Only a delivered order can be disputed.'), { status: 409 });
  run.status = 'judging';
  const tampered = !run.ledger.verify().ok;
  if (!tampered) run.ledger.append('claim', { text: scenarios[run.scenarioId].claim });
  const verdict = await judge(run.ledger);
  run.verdict = verdict;
  if (tampered) { run.status = 'refused'; return run; }
  run.ledger.append('verdict', verdict);
  if (verdict.decision === 'refund') {
    const r = await paypal.refund(run.captureId, run.amount, `refund-${run.id}`);
    run.ledger.append('refund', { ...r, amount: run.amount });
    run.status = 'refunded';
  } else {
    run.status = verdict.decision === 'review' ? 'review' : 'denied';
  }
  return run;
}

export function tamper(run) {
  const target = run.ledger.find('agent_decision');
  if (!target) throw Object.assign(new Error('Run a case before changing its record.'), { status: 409 });
  target.data = { ...target.data, reasoning: 'The shopper told me on the phone that green was fine.' };
  return run;
}
