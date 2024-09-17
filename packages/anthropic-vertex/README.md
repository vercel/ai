# Vercel AI SDK - Anthropic Vertex Provider

The **Anthropic Vertex Provider** contains language model support for the Anthropic Vertex Messages API.

## Setup

The Anthropic Vertex provider is available in the `@ai-sdk/anthropic-vertex` module.

## Provider Instance

You can import the default provider instance `anthropic` from `@ai-sdk/anthropic-vertex`:

```ts
import { anthropicVertex } from '@ai-sdk/anthropic-vertex';
```

## Example

```ts
import { anthropicVertex } from '@ai-sdk/anthropic-vertex';
import { generateText } from 'ai';

const { text } = await generateText({
  model: anthropicVertex('claude-3-haiku@20240307'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```