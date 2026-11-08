# Witness

A flight recorder and instant court for AI shopping agents, built on PayPal.

AI agents can already buy things. When one buys the wrong thing, nobody can easily prove what the shopper authorized, what the agent saw, or who should pay. Witness records that chain and settles the dispute through PayPal.

**Live demo:** https://paypal-hackathon-rkh0.onrender.com (the free host can take up to a minute to wake up)

## Try it

1. Open the live demo and choose **The agent guesses wrong**.
2. Click **Approve limit in PayPal** and log in with the sandbox buyer account listed in the Devpost testing notes.
3. Back in Witness, click **File the buyer's claim** to see the ruling and the refund.
4. Choose **A store tricks the agent** to see the gate stop a purchase after the AI falls for hidden text.
5. On a delivered order, click **Rewrite the agent's reasoning** before filing the claim to see the record rejected.

## How it works

1. **Signed instruction.** "Blue rain jacket, size M, under $60" becomes rules signed with Ed25519.
2. **PayPal hold.** The buyer approves one PayPal authorization for the limit, so the agent cannot spend more.
3. **Gate.** Code with no AI in it checks each purchase against the signed rules. A failed check voids the hold.
4. **Record.** Each step is added to a hash-chained log, so later edits are detectable.
5. **Ruling.** AI reads the record and cites the steps behind its ruling. Store pages count as evidence, never as instructions.
6. **Settlement.** A refund runs only if the AI's ruling matches the recorded facts. Otherwise the case goes to a person.

## Run it

Requires Node 22.9 or later. There are no dependencies.

```bash
npm start     # http://localhost:3000
npm test
```

With no keys, payments are simulated, the agent is scripted, and rulings use the built-in rules.

To use the PayPal sandbox and AI, copy `.env.example` to `.env` and add your keys:

- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` from a sandbox app at developer.paypal.com
- `GEMINI_API_KEY` from Google AI Studio (free tier). `ANTHROPIC_API_KEY` also works.

## PayPal APIs used

| Step | API |
| --- | --- |
| Hold the limit | `POST /v2/checkout/orders` with `AUTHORIZE` intent |
| Confirm the hold | `POST /v2/checkout/orders/{id}/authorize` |
| Pay the actual price | `POST /v2/payments/authorizations/{id}/capture` |
| Release a blocked purchase | `POST /v2/payments/authorizations/{id}/void` |
| Refund after a ruling | `POST /v2/payments/captures/{id}/refund` |

## AI used

Google Gemini (`gemini-3.1-flash-lite` by default) does three jobs:

- Turns the shopper's instruction into purchase rules.
- Acts as the shopping agent, reading the raw store page and deciding whether to buy. It is deliberately under-guarded, to model the kind of agent Witness exists to catch.
- Rules on disputes and cites the record entries behind each ruling.

The interface shows whether each decision came from AI or from the fallback script and rules.

## License

MIT
