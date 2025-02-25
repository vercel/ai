# AI SDK - LangDB.ai Provider

The **[LangDB.ai provider](https://sdk.vercel.ai/providers/ai-sdk-providers/langdb)** for the [AI SDK](https://sdk.vercel.ai/docs) contains language model support for the [LangDB.ai](https://langdb.ai) platform.

## Setup

The LangDB.ai provider is available in the `@ai-sdk/langdb` module. You can install it with

```bash
npm i @ai-sdk/langdb
```


## Provider Instance

You can import the default provider instance `langDB` from `@ai-sdk/langdb`:

```ts
import { langDB } from '@ai-sdk/langdb';
```
## Example

```ts
import { langDB } from '@ai-sdk/langdb';
import { generateText } from 'ai';

const { text } = await generateText({
  model: langDB('openai/gpt-4o-mini'),
  prompt: 'Write a Python function that sorts a list:',
});

console.log(text);
```
## Documentation

Please check out the **[LangDB provider](https://sdk.vercel.ai/providers/ai-sdk-providers/langdb)** for more information.
