# Gradium provider for the AI SDK

`@gradium/ai-sdk` adapts `@gradium/sdk` to the AI SDK's v4 speech and transcription interfaces.

```ts
import { gradium } from '@gradium/ai-sdk';
import { generateSpeech, transcribe } from 'ai';

const { audio } = await generateSpeech({
  model: gradium.speech('default'),
  text: 'Hello from Gradium!',
  voice: 'YTpq7expH9539ERJ',
  outputFormat: 'wav',
});

const transcript = await transcribe({
  model: gradium.transcription('default'),
  audio: audio.uint8Array,
});
console.log(transcript.text, transcript.segments);
```

Set `GRADIUM_API_KEY`, or pass `apiKey` to `createGradium`. Authentication is resolved when a request starts, so importing the default provider requires no credentials.

## Local development

This package depends on the published `@gradium/sdk@^0.1.0` from npm.

```sh
pnpm install
pnpm exec turbo build --filter @gradium/ai-sdk...
pnpm --filter @gradium/ai-sdk test
```

Examples live in `examples/ai-functions/src/generate-speech/gradium/basic.ts` and `examples/ai-functions/src/transcribe/gradium/basic.ts`. Run them with `GRADIUM_API_KEY` set. The transcription example defaults to the bundled `data/galileo-opus.ogg` sample and accepts a WAV or Ogg Opus file path as its first argument.

To generate speech and transcribe the resulting audio in one request sequence:

```sh
cd examples/ai-functions
FAIL_ON_ERROR=1 pnpm tsx src/generate-speech/gradium/round-trip.ts
```

See [the provider documentation](../../content/providers/05-community-providers/56-gradium.mdx) for supported formats and options. This is a local community provider package; it has not been published by this change.
