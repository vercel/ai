# AI SDK - Valibot Schema Support

Allows you to use [Valibot](https://valibot.dev/) schemas with AI SDK.

## Setup

```bash
npm i ai @ai-sdk/valibot @ai-sdk/anthropic valibot
```

## Usage

```ts
import { anthropic } from '@ai-sdk/anthropic';
import { valibotSchema } from '@ai-sdk/valibot';
import { generateText, Output } from 'ai';
import * as v from 'valibot';

const result = await generateText({
  model: anthropic('claude-sonnet-5-5'),
  output: Output.object({
    schema: valibotSchema(
      v.object({
        recipe: v.object({
          name: v.string(),
          ingredients: v.array(
            v.object({
              name: v.string(),
              amount: v.string(),
            }),
          ),
          steps: v.array(v.string()),
        }),
      }),
    ),
  }),
  prompt: 'Generate a lasagna recipe.',
});
```

See the [Valibot Schema Support documentation](https://ai-sdk.dev/docs/reference/ai-sdk-core/valibot-schema) for more information.
