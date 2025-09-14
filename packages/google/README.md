# AI SDK - Google Generative AI Provider

The **[Google Generative AI provider](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [Google Generative AI](https://ai.google/discover/generativeai/) APIs.

## Setup

The Google Generative AI provider is available in the `@ai-sdk/google` module. You can install it with

```bash
npm i @ai-sdk/google
```

## Provider Instance

You can import the default provider instance `google` from `@ai-sdk/google`:

```ts
import { google } from '@ai-sdk/google';
```

## Example

```ts
import { google } from '@ai-sdk/google';
import { generateText } from 'ai';

const { text } = await generateText({
  model: google('gemini-1.5-pro-latest'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Property Ordering for Structured Output

When using structured output with Google Generative AI models, you can control the order of properties in JSON responses using the `propertyOrdering` provider option. This ensures consistent property ordering and can improve response quality.

### Basic Example - Simple Array Format

For simple root-level property ordering, you can use an array:

```ts
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

const result = await generateObject({
  model: google('gemini-2.0-flash'),
  providerOptions: {
    google: {
      propertyOrdering: ['name', 'age', 'email'], // Simple array for root properties
    },
  },
  schema: z.object({
    name: z.string(),
    age: z.number(),
    email: z.string(),
  }),
  prompt: 'Generate a person profile',
});
```

### Object Format for Root-Level Properties

Alternatively, you can use the object format:

```ts
const result = await generateObject({
  model: google('gemini-2.0-flash'),
  providerOptions: {
    google: {
      propertyOrdering: {
        '': ['name', 'age', 'email'], // Root level properties using object format
      },
    },
  },
  schema: z.object({
    name: z.string(),
    age: z.number(),
    email: z.string(),
  }),
  prompt: 'Generate a person profile',
});
```

### Nested Object Ordering

For complex nested objects, use dot notation to specify property ordering at each level:

```ts
const result = await generateObject({
  model: google('gemini-2.0-flash'),
  providerOptions: {
    google: {
      propertyOrdering: {
        '': ['name', 'profile', 'preferences'],
        profile: ['bio', 'settings', 'contacts'],
        'profile.settings': ['theme', 'notifications'],
        preferences: ['language', 'timezone'],
      },
    },
  },
  schema: z.object({
    name: z.string(),
    profile: z.object({
      bio: z.string(),
      settings: z.object({
        theme: z.string(),
        notifications: z.boolean(),
      }),
      contacts: z.array(z.string()),
    }),
    preferences: z.object({
      language: z.string(),
      timezone: z.string(),
    }),
  }),
  prompt: 'Generate a comprehensive user profile',
});
```

The property ordering follows Google's [structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output#property-ordering) and helps ensure consistent, predictable JSON responses from Gemini models.

## Documentation

Please check out the **[Google Generative AI provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)** for more information.
