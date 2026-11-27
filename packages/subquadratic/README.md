# AI SDK - SubQ Provider

The **[SubQ provider](https://ai-sdk.dev/providers/ai-sdk-providers/subquadratic)** for the [AI SDK](https://ai-sdk.dev/docs) supports SubQ Savant language models through the SubQ Chat Completions API and SubQ Snap decision models through the SubQ Decisions API.

## Setup

```bash
npm i ai @ai-sdk/subquadratic
```

## Usage

```ts
import { subquadratic } from '@ai-sdk/subquadratic';
import { generateText } from 'ai';

// Set SUBQUADRATIC_API_KEY in your environment.
const { text } = await generateText({
  model: subquadratic('subq-savant-1.4'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

See the [SubQ provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/subquadratic) for more information.
