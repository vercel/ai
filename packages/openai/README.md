# AI SDK - OpenAI Provider

The **[OpenAI provider](https://sdk.vercel.ai/providers/ai-sdk-providers/openai)** for the [AI SDK](https://sdk.vercel.ai/docs)
contains language model support for the OpenAI chat and completion APIs and embedding model support for the OpenAI embeddings API.

## Setup

The OpenAI provider is available in the `@ai-sdk/openai` module. You can install it with

```bash
npm i @ai-sdk/openai
```

## Provider Instance

You can import the default provider instance `openai` from `@ai-sdk/openai`:

```ts
import { openai } from '@ai-sdk/openai';
```

## Example

```ts
import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';

const { text } = await generateText({
  model: openai('gpt-4-turbo'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Documentation

Please check out the **[OpenAI provider documentation](https://sdk.vercel.ai/providers/ai-sdk-providers/openai)** for more information.

## OpenAI Moderation API

The OpenAI Moderation API is now supported in this library. It allows you to check if content complies with OpenAI's usage policies.

### Usage

```typescript
import { openai } from '@ai-sdk/openai';

// Create a moderation model
const moderationModel = openai.moderation('text-moderation-latest');

// Moderate a single input
const result = await moderationModel.moderate({
  input: 'Text to be checked for policy violations',
});

console.log('Flagged:', result.results[0].flagged);
console.log('Categories:', result.results[0].categories);
console.log('Category Scores:', result.results[0].category_scores);

// Moderate multiple inputs
const batchResult = await moderationModel.moderate({
  input: ['First text to check', 'Second text to check'],
});

// Process each result
batchResult.results.forEach((result, index) => {
  console.log(`Result ${index}:`, result.flagged);
});

// For the omni-moderation-latest model, you can also moderate images
const imageModeration = openai.moderation('omni-moderation-latest');
const imageResult = await imageModeration.moderate({
  input: {
    type: 'image_url',
    image_url: {
      url: 'https://example.com/image.jpg',
    },
  },
});

// You can also moderate text and images in the same request
const mixedResult = await imageModeration.moderate({
  input: [
    { type: 'text', text: 'Text to check' },
    {
      type: 'image_url',
      image_url: { url: 'https://example.com/image.jpg' },
    },
  ],
});

// The API will tell you which input types triggered each category
console.log(
  'Input types that triggered flags:',
  mixedResult.results[0].category_applied_input_types,
);
```

### Available Models

- `text-moderation-latest` - The latest text moderation model
- `text-moderation-stable` - The stable text moderation model
- `omni-moderation-latest` - Can moderate both text and images
- `omni-moderation-2024-09-26` - A specific version of the omni moderation model

### Response Structure

The moderation response includes:

- `model`: The ID of the model used
- `results`: An array of moderation results for each input
  - `flagged`: Whether the content violates OpenAI's usage policies
  - `categories`: Object showing which categories are flagged
  - `category_scores`: Object with numerical scores for each category
  - `category_applied_input_types`: Object showing which input types (text or image) triggered each category
- `rawResponse`: Contains response metadata including headers

### Categories

The moderation API checks for the following categories:

- `harassment`
- `harassment/threatening`
- `hate`
- `hate/threatening`
- `self-harm`
- `self-harm/instructions`
- `self-harm/intent`
- `sexual`
- `sexual/minors`
- `violence`
- `violence/graphic`
- `illicit`
- `illicit/violent`
