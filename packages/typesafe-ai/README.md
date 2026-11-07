# AI SDK - TypeSafe Provider

The **[TypeSafe provider](https://ai-sdk.dev/providers/ai-sdk-providers/typesafe-ai)**
for the [AI SDK](https://ai-sdk.dev/docs) decides answers to Choice, Score, and Boolean
questions using TypeSafe's System One models.

## Setup

```bash
npm i ai @ai-sdk/typesafe-ai
```

## Usage

```ts
import { typeSafeAi } from '@ai-sdk/typesafe-ai';
import { experimental_decide } from 'ai';

const result = await experimental_decide({
  model: typeSafeAi.decisionModel('jev-latest'),
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

See the [TypeSafe Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/typesafe-ai) for more information.
