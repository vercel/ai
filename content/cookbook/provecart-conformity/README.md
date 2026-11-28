# ProveCart pre-payment check — Vercel AI SDK example

Gate an AI SDK agent's checkout on a ProveCart conformity check:
the agent builds a cart from the customer's instructions, the
check compares the cart to the signed mandate, and payment may
proceed only on a MATCH verdict. BLOCK returns machine-readable
corrections (Agent Correction Format) the agent can apply and
resubmit; REVIEW escalates to the buyer.

## Files

- `provecart.ts` — framework-free client + verdict routing rules
- `check-cart-before-payment.ts` — a `tool()` the model can call,
  plus a runnable `generateText` demo

## Run

```bash
npm i ai @ai-sdk/openai zod tsx
PROVECART_API_KEY=<your integrator key> npx tsx check-cart-before-payment.ts
```

Integrator keys are issued through the merchant portal at
https://provecart.com/portal. ProveCart never holds or moves
money; the check returns a verdict and a sealed evidence record.

Published by ProveCart, a verification service for agent commerce
based in the Bay Area. Patent pending.
