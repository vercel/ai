# Evaluation examples

These examples use `experimental_evaluate` to answer named questions against one
shared state. Questions can return a choice, a score, or a boolean probability.
The API is experimental and may change in patch releases.

## Getting started

From the AI SDK repository root, install dependencies and build the packages:

```sh
pnpm install
pnpm build
```

Then switch to the examples directory and run the mock example, which requires
no API credentials or model calls:

```sh
cd examples/ai-functions
pnpm tsx src/evaluate/mock/basic.ts
```

For a live provider example, add the corresponding API key to
`examples/ai-functions/.env`. The examples load this file automatically when run
from `examples/ai-functions`.

| Provider          | Environment variable           |
| ----------------- | ------------------------------ |
| Vercel AI Gateway | `AI_GATEWAY_API_KEY`           |
| TypeSafe AI       | `TYPESAFE_AI_API_KEY`          |
| OpenAI            | `OPENAI_API_KEY`               |
| Anthropic         | `ANTHROPIC_API_KEY`            |
| Google            | `GOOGLE_GENERATIVE_AI_API_KEY` |

For example, to run Jev through AI Gateway, set `AI_GATEWAY_API_KEY` and run:

```sh
pnpm tsx src/evaluate/gateway/basic.ts
```

## Examples

All paths below are relative to this directory. Run any script with
`pnpm tsx src/evaluate/<path>` from `examples/ai-functions`.

| Example                                                                  | Demonstrates                                                                                          |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| [mock/basic.ts](./mock/basic.ts)                                         | Return a fixed boolean probability with a mock evaluation model.                                      |
| [gateway/basic.ts](./gateway/basic.ts)                                   | Evaluate Choice, Score, and Boolean questions with Jev through AI Gateway.                            |
| [typesafe-ai/basic.ts](./typesafe-ai/basic.ts)                           | Call Jev directly through the TypeSafe AI provider and inspect answers, usage, and provider metadata. |
| [typesafe-ai/structured-rubrics.ts](./typesafe-ai/structured-rubrics.ts) | Use JSON objects and arrays in state, instructions, and criteria.                                     |
| [typesafe-ai/registry.ts](./typesafe-ai/registry.ts)                     | Register a custom model alias and route answers using probability thresholds.                         |
| [typesafe-ai/error-handling.ts](./typesafe-ai/error-handling.ts)         | Submit oversized state and inspect `APICallError` details if the provider rejects it.                 |
| [openai/basic.ts](./openai/basic.ts)                                     | Evaluate all three question types with OpenAI.                                                        |
| [openai/default-provider.ts](./openai/default-provider.ts)               | Configure a global default provider and resolve an evaluation model by alias.                         |
| [anthropic/basic.ts](./anthropic/basic.ts)                               | Evaluate all three question types with Anthropic.                                                     |
| [google/basic.ts](./google/basic.ts)                                     | Evaluate all three question types with Google and configure thinking through provider options.        |

## Interpreting results

TypeSafe AI provides native evaluations. The OpenAI, Anthropic, and Google
adapters use structured language-model output and evaluate all questions in one
prompt. Their boolean probabilities are prompted estimates; Choice and Score
answers do not include probability distributions.

Choice and Score distributions are optional in the shared API. Check for their
presence before using them, and choose routing thresholds using labeled data
from your application. A boolean probability estimates whether the statement is
true; it is not confidence in either outcome. TypeSafe's separate Choice/Score
confidence statistic is available in `providerMetadata`.

## Related resources

- [AI SDK evaluation documentation](https://ai-sdk.dev/docs/ai-sdk-core/evaluation)
- [What is Jev?](https://vercel.com/i/what-is-jev)
- [Jev use cases](https://vercel.com/i/jev-use-cases)
- [Classify, route, and score with Jev and AI SDK](https://vercel.com/kb/guide/typesafe-jev-and-ai-sdk)
- [Jev and AI SDK form router guide](https://vercel.com/kb/guide/jev-ai-sdk-form-router)
- [Jev and AI SDK form router template](https://vercel.com/templates/next.js/jev-and-ai-sdk)
