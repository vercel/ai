# AI SDK - Google Vertex AI Provider

The **[Google Vertex provider](https://sdk.vercel.ai/providers/ai-sdk-providers/google-vertex)** for the [AI SDK](https://sdk.vercel.ai/docs) contains language model support for the [Google Vertex AI](https://cloud.google.com/vertex-ai) APIs.

## Setup

The Google provider is available in the `@ai-sdk/google-vertex` module. You can install it with

```bash
npm i @ai-sdk/google-vertex
```

## Provider Instance

You can import the default provider instance `vertex` from `@ai-sdk/google-vertex`:

```ts
import { vertex } from '@ai-sdk/google-vertex';
```

## Example

```ts
import { vertex } from '@ai-sdk/google-vertex'
import { generateText } from 'ai'

const { text } = await generateText({
  model: vertex('gemini-1.5-flash')
  prompt: 'Write a vegetarian lasagna recipe for 4 people.'
})
```

## Documentation

Please check out the **[Google Vertex provider](https://sdk.vercel.ai/providers/ai-sdk-providers/google-vertex)** for more information.
