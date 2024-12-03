# AI SDK - Google Vertex AI Provider

The **[Google Vertex provider](https://sdk.vercel.ai/providers/ai-sdk-providers/google-vertex)** for the [AI SDK](https://sdk.vercel.ai/docs) contains language model support for the [Google Vertex AI](https://cloud.google.com/vertex-ai) APIs.

## Setup

The Google provider is available in the `@ai-sdk/google-vertex` module. You can install it with

```bash
npm i @ai-sdk/google-vertex
```

## Authentication & Usage Examples

The Google Vertex provider supports two authentication methods depending on your runtime environment:

### Node.js Runtime

```ts
import { createVertex } from '@ai-sdk/google-vertex';
import { generateAuthToken } from '@ai-sdk/google-vertex/auth-google';
import { generateText } from 'ai';

const vertex = createVertex({
  headers: async () => ({
    Authorization: `Bearer ${await generateAuthToken()}`,
  }),
});

const { text } = await generateText({
  model: vertex('gemini-1.5-flash'),
  prompt: 'Write a vegetarian lasagna recipe.',
});
```

This method supports all standard Google Cloud authentication options through the [`google-auth-library` ](https://github.com/googleapis/google-auth-library-nodejs?tab=readme-ov-file#ways-to-authenticate) including:

- Service account credentials
- Application Default Credentials
- User credentials
- Workload Identity Federation

### Edge Runtime

```ts
import { createVertex } from '@ai-sdk/google-vertex';
import { generateAuthToken } from '@ai-sdk/google-vertex/auth-edge';
import { generateText } from 'ai';

const vertex = createVertex({
  headers: async () => ({
    Authorization: `Bearer ${await generateAuthToken()}`,
  }),
});

const { text } = await generateText({
  model: vertex('gemini-1.5-flash'),
  prompt: 'Write a vegetarian lasagna recipe.',
});
```

This method supports Google's [Application Default Credentials](https://github.com/googleapis/google-auth-library-nodejs?tab=readme-ov-file#application-default-credentials) through environment variables only. The values can be obtained from a json credentials file obtained from the Google Cloud Console.

## Documentation

Please check out the **[Google Vertex provider](https://sdk.vercel.ai/providers/ai-sdk-providers/google-vertex)** for more information.
