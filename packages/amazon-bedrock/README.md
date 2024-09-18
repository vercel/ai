# AI SDK - Amazon Bedrock Provider

The **[Amazon Bedrock provider](https://sdk.vercel.ai/providers/ai-sdk-providers/amazon-bedrock)** for the [AI SDK](https://sdk.vercel.ai/docs)
contains language model support for the Amazon Bedrock [converse API](https://docs.aws.amazon.com/bedrock/latest/APIReference/API_runtime_Converse.html).

## Setup

The Amazon Bedrock provider is available in the `@ai-sdk/amazon-bedrock` module. You can install it with

```bash
npm i @ai-sdk/amazon-bedrock
```

## Provider Instance

You can import the default provider instance `bedrock` from `@ai-sdk/amazon-bedrock`:

```ts
import { bedrock } from '@ai-sdk/amazon-bedrock';
```

## Example

```ts
import { bedrock } from '@ai-sdk/amazon-bedrock';
import { generateText } from 'ai';

const { text } = await generateText({
  model: bedrock('meta.llama3-8b-instruct-v1:0'),
  prompt: 'Write a vegetarian lasagna recipe for 4 people.',
});
```

## Documentation

Please check out the **[Amazon Bedrock provider documentation](https://sdk.vercel.ai/providers/ai-sdk-providers/amazon-bedrock)** for more information.
