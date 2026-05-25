# AI SDK - Gradium Provider

The **[Gradium provider](https://ai-sdk.dev/providers/ai-sdk-providers/gradium)** for the [AI SDK](https://ai-sdk.dev/docs)
contains speech model support for the Gradium text-to-speech API and transcription model support for the Gradium speech-to-text API.

Gradium is built for low-latency voice applications. This package exposes Gradium's request/response TTS and STT APIs through the AI SDK, plus helper APIs for voices, pronunciation dictionaries, and credits. For live microphones, telephony streams, semantic VAD, adaptive delay control, and flush-driven turn-taking, use Gradium's realtime WebSocket APIs directly.

## Setup

The Gradium provider is available in the `@ai-sdk/gradium` module. You can install it with

```bash
npm i @ai-sdk/gradium
```

## Provider Instance

You can import the default provider instance `gradium` from `@ai-sdk/gradium`:

```ts
import { gradium } from '@ai-sdk/gradium';
```

## Examples

### Text-to-Speech

```ts
import { gradium } from '@ai-sdk/gradium';
import { experimental_generateSpeech as generateSpeech } from 'ai';

const { audio } = await generateSpeech({
  model: gradium.speech('default'),
  text: 'Hello from Gradium.',
  voice: 'YTpq7expH9539ERJ',
});
```

### Transcription

```ts
import { gradium } from '@ai-sdk/gradium';
import { experimental_transcribe as transcribe } from 'ai';

const { text } = await transcribe({
  model: gradium.transcription('default'),
  audio: new Uint8Array([1, 2, 3, 4]),
  mediaType: 'audio/wav',
});
```

### Advanced Transcription Settings

```ts
import { gradium, type GradiumTranscriptionModelOptions } from '@ai-sdk/gradium';
import { experimental_transcribe as transcribe } from 'ai';

const { text } = await transcribe({
  model: gradium.transcription('default'),
  audio,
  mediaType: 'audio/pcm',
  providerOptions: {
    gradium: {
      inputFormat: 'pcm_16000',
      jsonConfig: JSON.stringify({
        language: 'en',
        delay_in_frames: 16,
      }),
    } satisfies GradiumTranscriptionModelOptions,
  },
});
```

`delay_in_frames` tunes the latency/quality tradeoff for Gradium STT. Semantic VAD `step` events and `flush` confirmations are realtime WebSocket features and are not emitted by the AI SDK `transcribe` helper.

### Resource APIs

```ts
const voices = await gradium.voices.list({ includeCatalog: true });
const credits = await gradium.credits.get();

const dictionary = await gradium.pronunciations.create({
  name: 'Product terms',
  language: 'en',
  rules: [{ original: 'Gradium', rewrite: 'gray-dee-um' }],
});
```

## Documentation

Please check out the **[Gradium provider documentation](https://ai-sdk.dev/providers/ai-sdk-providers/gradium)** for more information.
