# AI SDK - ScaleDown Provider

The **[ScaleDown provider](https://ai-sdk.dev/providers/ai-sdk-providers/scaledown)** for the [AI SDK](https://ai-sdk.dev/docs) supports choice, boolean, and score questions through ScaleDown's Decisions API and text extraction through its Extract API.

## Setup

```bash
npm i ai @ai-sdk/scaledown
```

## Usage

```ts
import { scaledown } from '@ai-sdk/scaledown';
import { experimental_decide } from 'ai';

// Set SCALEDOWN_API_KEY in your environment.
const result = await experimental_decide({
  model: scaledown.decisionModel('classify-1'),
  state: 'I was charged twice for my subscription.',
  questions: {
    category: {
      type: 'choice',
      criteria: {
        billing: 'Charges, invoices, and refunds',
        technical: 'Bugs and outages',
      },
    },
  },
});

console.log(result.answers);
```

See the [ScaleDown Provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/scaledown) for more information.
