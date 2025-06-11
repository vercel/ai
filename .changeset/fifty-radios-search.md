---
'ai': minor
---

Add ability to pass in an async function to the `settings` in the `defaultSettingsMiddleware`. This allows for dynamic default settings via an async call.

Example:

```ts
import { streamText } from 'ai';
import { wrapLanguageModel } from 'ai';
import { defaultSettingsMiddleware } from 'ai';
import { openai } from 'ai';
import { getDefaultConfig } from './config';

// Create a model with default settings
const modelWithDefaults = wrapLanguageModel({
  model: openai.ChatTextGenerator({ model: 'gpt-4' }),
  middleware: defaultSettingsMiddleware({
    settings: async (params) => {
      const config = await getDefaultConfig();
      return {
        temperature: config.temperature,
        maxTokens: config.maxTokens,
      };
    },
  }),
});

// Use the model - default settings will be applied
const result = await streamText({
  model: modelWithDefaults,
  prompt: 'Your prompt here',
  // These parameters will override the defaults
  temperature: 0.8,
});
```
