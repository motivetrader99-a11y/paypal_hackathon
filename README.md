# Witness

A flight recorder and instant court for AI shopping agents, built on PayPal.

AI agents can already buy things. When one buys the wrong thing, nobody can easily prove what the shopper authorized, what the agent saw, or who should pay. Witness records that chain and settles the dispute through PayPal.

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

With no keys, payments are simulated and rulings use the built-in rules.

To use the PayPal sandbox and AI, copy `.env.example` to `.env` and add your keys:

- `PAYPAL_CLIENT_ID` and `PAYPAL_CLIENT_SECRET` from a sandbox app at developer.paypal.com
- `ANTHROPIC_API_KEY`

## PayPal APIs used

| Step | API |
| --- | --- |
| Hold the limit | `POST /v2/checkout/orders` with `AUTHORIZE` intent |
| Confirm the hold | `POST /v2/checkout/orders/{id}/authorize` |
| Pay the actual price | `POST /v2/payments/authorizations/{id}/capture` |
| Release a blocked purchase | `POST /v2/payments/authorizations/{id}/void` |
| Refund after a ruling | `POST /v2/payments/captures/{id}/refund` |

## AI used

Claude turns the shopper's instruction into rules and rules on disputes. The shopping agent in the demo follows a script so each case can be repeated.

## License

MIT
