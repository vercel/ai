# AI SDK - Liquid Provider

The **[Liquid provider](https://ai-sdk.dev/providers/ai-sdk-providers/liquid)** for the [AI SDK](https://ai-sdk.dev/docs) supports Liquid's `d1.2` and `d1.2-ultra` decision models, which answer Choice, Score, Boolean, and Box questions about text, images, and audio.

## Setup

```bash
npm i ai @ai-sdk/liquid
```

## Usage

```ts
import { liquid } from '@ai-sdk/liquid';
import { experimental_decide } from 'ai';

// Set LIQUID_API_KEY in your environment.
const result = await experimental_decide({
  model: liquid.decisionModel('d1.2'),
  state: 'I was charged twice for my subscription.',
  questions: {
    team: {
      type: 'choice',
      instructions: 'Which team should handle this ticket?',
      criteria: {
        billing: 'Charges, invoices, and refunds',
        technical: 'Bugs and outages',
      },
    },
  },
});

console.log(result.answers.team.choice);
```

See the [Liquid provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/liquid) for more information.
