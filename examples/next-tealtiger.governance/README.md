# Governance Middleware Example — tealtiger-ai-sdk

This example demonstrates how to add deterministic governance to any Vercel AI SDK model using [tealtiger-ai-sdk](https://www.npmjs.com/package/tealtiger-ai-sdk).

## Features

- **PII Detection & Redaction** — Detects email, SSN, credit card, phone numbers in prompts
- **Prompt Injection Blocking** — Blocks known injection patterns before they reach the model
- **Cost Tracking** — Per-request, per-session, and daily budget limits
- **Circuit Breaker** — Prevents cascading failures with automatic cooldown
- **Structured Audit** — Correlation IDs, risk scores, evaluation time logging

All governance is deterministic and in-process — no LLM in the governance path, <5ms overhead.

## Running

```bash
# Set your OpenAI API key
export OPENAI_API_KEY=your-key

# Install dependencies
npm install

# Run the example
npx tsx src/index.ts
```


## How It Works

`tealtiger-ai-sdk` implements `LanguageModelV3Middleware`, hooking into:

| Hook | What it does |
|------|-------------|
| `transformParams` | PII redaction, injection detection (pre-request) |
| `wrapGenerate` | Cost tracking, circuit breaker, audit logging |
| `wrapStream` | Same governance for streaming responses |

## Links

- [tealtiger-ai-sdk on npm](https://www.npmjs.com/package/tealtiger-ai-sdk)
- [TealTiger Documentation](https://docs.tealtiger.ai)
- [Source Code](https://github.com/agentguard-ai/tealtiger/tree/main/packages/tealtiger-ai-sdk)
