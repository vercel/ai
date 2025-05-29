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

## Property Ordering

The Google provider supports Google's `propertyOrdering` extension for structured output to ensure consistent property ordering in responses. Configure this through the `propertyOrdering` setting when creating your model instance.

**Note:** Use `null` for leaf properties (final properties with no nested structure) and nested objects for properties that contain other properties.

### TypeScript Support

For better TypeScript support, you can import the `PropertyOrderingConfig` type:

```typescript
import { google, PropertyOrderingConfig } from '@ai-sdk/google';

// Explicitly typed configuration
const orderingConfig: PropertyOrderingConfig = {
  recipeName: null,
  ingredients: null,
  cookingTime: null,
};

const model = google('gemini-1.5-pro', {
  propertyOrdering: orderingConfig,
});
```

### Basic Usage

```typescript
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { jsonSchema } from 'ai';

const model = google('gemini-1.5-pro', {
  propertyOrdering: {
    recipeName: null,
    ingredients: null,
    cookingTime: null,
  },
});

const result = await generateObject({
  model,
  schema: jsonSchema({
    type: 'object',
    properties: {
      recipeName: { type: 'string' },
      ingredients: { type: 'array', items: { type: 'string' } },
      cookingTime: { type: 'number' },
    },
    required: ['recipeName'],
  }),
  prompt: 'Generate a recipe for chocolate chip cookies',
});

// Response will have properties in the specified order:
// {
//   "recipeName": "Chocolate Chip Cookies",
//   "ingredients": ["flour", "sugar", "chocolate chips"],
//   "cookingTime": 25
// }
```

### Nested Property Ordering

```typescript
const model = google('gemini-1.5-pro', {
  propertyOrdering: {
    user: {
      id: null,
      profile: {
        firstName: null,
        lastName: null,
        avatar: null,
      },
    },
    metadata: {
      createdAt: null,
      updatedAt: null,
    },
  },
});
```

### Usage with Zod Schemas

The property ordering configuration works seamlessly with Zod schemas. You don't need to modify your Zod schemas or use helper functions - simply define your schemas normally and configure property ordering separately in the model settings.

```typescript
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

// Define your Zod schema normally
const recipeSchema = z.object({
  recipeName: z.string(),
  ingredients: z.array(z.string()),
  cookingTime: z.number(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  chef: z.object({
    name: z.string(),
    experience: z.number(),
  }),
});

// Configure property ordering in the model settings
const model = google('gemini-1.5-pro', {
  propertyOrdering: {
    recipeName: null,
    chef: {
      name: null,
      experience: null,
    },
    ingredients: null,
    cookingTime: null,
    difficulty: null,
  },
});

const result = await generateObject({
  model,
  schema: recipeSchema,
  prompt: 'Generate a recipe for chocolate chip cookies',
});

// Response will have properties in the specified order:
// {
//   "recipeName": "Chocolate Chip Cookies",
//   "chef": {
//     "name": "John Doe",
//     "experience": 10
//   },
//   "ingredients": ["flour", "sugar", "chocolate chips"],
//   "cookingTime": 25,
//   "difficulty": "easy"
// }
```

### Complex Nested Zod Example

```typescript
import { google } from '@ai-sdk/google';
import { generateObject } from 'ai';
import { z } from 'zod';

const userSchema = z.object({
  id: z.number(),
  personal: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    age: z.number(),
  }),
  preferences: z.object({
    theme: z.enum(['light', 'dark']),
    notifications: z.boolean(),
    language: z.string(),
  }),
  metadata: z.object({
    createdAt: z.string(),
    updatedAt: z.string(),
    lastLogin: z.string(),
  }),
});

const model = google('gemini-1.5-pro', {
  propertyOrdering: {
    // Top-level ordering
    id: null,
    personal: {
      // Personal info ordering
      firstName: null,
      lastName: null,
      email: null,
      age: null,
    },
    preferences: {
      // Preferences ordering
      theme: null,
      language: null,
      notifications: null,
    },
    metadata: {
      // Metadata ordering
      createdAt: null,
      updatedAt: null,
      lastLogin: null,
    },
  },
});

const result = await generateObject({
  model,
  schema: userSchema,
  prompt: 'Generate a user profile for John Doe',
});
```

For comprehensive documentation and examples, see [GOOGLE_PROPERTY_ORDERING.md](../../GOOGLE_PROPERTY_ORDERING.md).

## Documentation

Please check out the **[Google Generative AI provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/google-generative-ai)** for more information.
