# AI SDK - Google Vertex AI Provider

The **[Google Vertex provider](https://sdk.vercel.ai/providers/ai-sdk-providers/google-vertex)** for the [AI SDK](https://sdk.vercel.ai/docs) contains language model support for the [Google Vertex AI](https://cloud.google.com/vertex-ai) APIs.

## Setup

The Google provider is available in the `@ai-sdk/google-vertex` module. You can install it with

```bash
npm i @ai-sdk/google-vertex
```

## Authentication & Usage Examples

The Google Vertex provider has two different authentication implementations depending on your runtime environment:

### Node.js Runtime

The Node.js runtime is the default runtime supported by the AI SDK. You can use the default provider instance to generate text with the `gemini-1.5-flash` model like this:

```ts
import { vertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';

const { text } = await generateText({
  model: vertex('gemini-1.5-flash'),
  prompt: 'Write a vegetarian lasagna recipe.',
});
```

This provider supports all standard Google Cloud authentication options through the [`google-auth-library` ](https://github.com/googleapis/google-auth-library-nodejs?tab=readme-ov-file#ways-to-authenticate). The most common authentication method is to set the path to a json credentials file in the `GOOGLE_APPLICATION_CREDENTIALS` environment variable. Credentials can be obtained from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

### Edge Runtime

The Edge runtime is supported through the `@ai-sdk/google-vertex/edge` module. Note the additional sub-module path `/edge` required to differentiate the Edge provider from the Node.js provider.

You can use the default provider instance to generate text with the `gemini-1.5-flash` model like this:

```ts
import { vertex } from '@ai-sdk/google-vertex/edge';
import { generateText } from 'ai';

const { text } = await generateText({
  model: vertex('gemini-1.5-flash'),
  prompt: 'Write a vegetarian lasagna recipe.',
});
```

This method supports Google's [Application Default Credentials](https://github.com/googleapis/google-auth-library-nodejs?tab=readme-ov-file#application-default-credentials) through the environment variables `GOOGLE_CLIENT_EMAIL`, `GOOGLE_PRIVATE_KEY`, and (optionally) `GOOGLE_PRIVATE_KEY_ID`. The values can be obtained from a json credentials file obtained from the [Google Cloud Console](https://console.cloud.google.com/apis/credentials).

## Custom Provider Configuration

You can create a custom provider instance using the `createVertex` function. This allows you to specify additional configuration options. Below is an example with the default Node.js provider which includes a `googleAuthOptions` object.

```ts
import { createVertex } from '@ai-sdk/google-vertex';
import { generateText } from 'ai';

const customProvider = createVertex({
  projectId: 'your-project-id',
  location: 'us-central1',
  googleAuthOptions: {
    credentials: {
      client_email: 'your-client-email',
      private_key: 'your-private-key',
    },
  },
});

const { text } = await generateText({
  model: customProvider('gemini-1.5-flash'),
  prompt: 'Write a vegetarian lasagna recipe.',
});
```

The `googleAuthOptions` object is not present in the Edge provider options but custom provider creation is otherwise identical.

The Edge provider supports a `googleCredentials` option rather than `googleAuthOptions`. This can be used to specify the Google Cloud service account credentials and will take precedence over the environment variables used otherwise.

```ts
import { createVertex } from '@ai-sdk/google-vertex/edge';
import { generateText } from 'ai';

const customProvider = createVertex({
  projectId: 'your-project-id',
  location: 'us-central1',
  googleCredentials: {
    clientEmail: 'your-client-email',
    privateKey: 'your-private-key',
  },
});

const { text } = await generateText({
  model: customProvider('gemini-1.5-flash'),
  prompt: 'Write a vegetarian lasagna recipe.',
});
```

## Documentation

Please check out the **[Google Vertex provider](https://sdk.vercel.ai/providers/ai-sdk-providers/google-vertex)** for more information.
