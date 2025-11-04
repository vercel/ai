# AI SDK - OVHcloud Provider

The **[OVHcloud provider](https://ai-sdk.dev/providers/ai-sdk-providers/ovhcloud)** for the [AI SDK](https://ai-sdk.dev/docs) contains language model support for the [OVHcloud AI Endpoints](https://endpoints.ai.cloud.ovh.net/) platform.

## Setup

The OVHcloud provider is available in the `@ai-sdk/ovhcloud` module. You can install it with

```bash
npm i @ai-sdk/ovhcloud
```

## Provider Instance

You can import the default provider instance `ovhcloud` from `@ai-sdk/ovhcloud`:

```ts
import { ovhcloud } from '@ai-sdk/ovhcloud';
```

## Example

```ts
import { ovhcloud } from '@ai-sdk/ovhcloud';
import { generateText } from 'ai';

const { text } = await generateText({
  model: ovhcloud('model-name'),
  prompt: 'Write a JavaScript function that sorts a list:',
});
```

## Documentation

Please check out the **[OVHcloud provider](https://ai-sdk.dev/providers/ai-sdk-providers/ovhcloud)** for more information.

