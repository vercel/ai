# AI SDK - AIMLAPI Provider

The **[AIMLAPI provider](https://ai-sdk.dev/providers/community-providers/aimlapi)** for the [AI SDK](https://ai-sdk.dev/docs) allows using models via the AIMLAPI service.

## Setup

Install the package via pnpm, npm, or yarn:

```bash
npm i @ai-sdk/aimlapi
```

## Provider Instance

You can import the default provider instance `aimlapi` from `@ai-sdk/aimlapi`:

```ts
import { aimlapi } from '@ai-sdk/aimlapi';
```

## Example

```ts
import { aimlapi } from '@ai-sdk/aimlapi';
import { generateText } from 'ai';

const { text } = await generateText({
  model: aimlapi('gpt-3.5-turbo'),
  prompt: 'Hello from AIMLAPI!',
});
```

### Using the `gpt-4o` model

```ts
import 'dotenv/config';
import { generateText, LanguageModel } from 'ai';
import { aimlapi } from '@ai-sdk/aimlapi';

async function main() {
  const { text } = await generateText({
    model: aimlapi('gpt-4o') as LanguageModel,
    system: 'You are a friendly assistant!',
    prompt: 'Why is the sky blue?',
  });

  console.log(text);
}

main();
```

### Generating images

```ts
import 'dotenv/config';
import { experimental_generateImage } from 'ai';
import { aimlapi } from '@ai-sdk/aimlapi';
import * as fs from 'fs';

async function main() {
  const model = aimlapi.imageModel?.('flux-realism');
  if (!model) throw new Error('Image model not available');

  const { image } = await experimental_generateImage({
    model,
    prompt: 'pixelated image of a cute baby sea otter, 8-bit style, vibrant colors',
  });

  const jsonText = new TextDecoder().decode(image.uint8Array);
  const json = JSON.parse(jsonText);
  const url = json.data?.[0]?.url;

  if (!url) {
    console.error('❌ URL not found in image response');
    return;
  }

  console.log('✅ Image URL:', url);

  fs.writeFile('imageUrlFile.txt', url, (err) => {
    if (err) {
      console.error('Error writing to file:', err);
      return;
    }
    console.log('File written successfully.');
  });
}

main().catch(console.error);
```

## Documentation

See the **[AIMLAPI provider docs](https://ai-sdk.dev/providers/community-providers/aimlapi)** for more details.
