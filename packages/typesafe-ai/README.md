# AI SDK TypeSafe Provider

The **[TypeSafe provider](https://ai-sdk.dev/providers/ai-sdk-providers/typesafe-ai)**
for the [AI SDK](https://ai-sdk.dev/docs) evaluates Choice, Score, and Boolean
questions using TypeSafe's System One models.

## Setup

```sh
pnpm add @ai-sdk/typesafe-ai ai
```

Set `TYPESAFE_AI_API_KEY`, then pass an evaluation model instance:

```ts
import { typesafe } from '@ai-sdk/typesafe-ai';
import { experimental_evaluate } from 'ai';

const result = await experimental_evaluate({
  model: typesafe.evaluationModel('jev-latest'),
  state: 'I was charged twice. Please refund the duplicate.',
  questions: {
    department: {
      type: 'choice',
      instructions: 'Which team should handle this?',
      criteria: { billing: 'Charges and refunds', support: 'Other requests' },
    },
    requestsRefund: {
      type: 'boolean',
      instructions: 'Is the customer requesting money back?',
    },
  },
});

console.log(result.answers);
```

Evaluation is experimental. The package exports `typesafe`, `createTypeSafe`,
`TypeSafeProviderSettings`, `Experimental_TypeSafeProvider`,
`Experimental_TypeSafeEvaluationModelId`, and `VERSION`.

## Configuration

`createTypeSafe({ apiKey, baseURL, headers, fetch })` supports an explicit key,
custom headers, a custom fetch implementation, and a base URL (default:
`https://api.typesafe.ai/v1`). The default key comes from `TYPESAFE_AI_API_KEY`.
Language, embedding, and image model factories are unsupported.

All questions are sent in one request against shared state. Choice supports up to
255 options; Score supports 2–10 ordered levels; Boolean maps to TypeSafe's Noul
primitive. Instructions and descriptions accept structured JSON. No
provider-specific options are currently defined.

Native distributions and scores are preserved. TypeSafe returns rounded values;
`result.rounding` declares two decimal places so core can validate rounding error
without changing the numbers. TypeSafe confidence is separate from probability:
find it at `result.providerMetadata.typesafe.confidence[questionId]`.

See the [provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/typesafe-ai)
and [TypeSafe API reference](https://docs.typesafe.ai/api).
