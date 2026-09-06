---
title: experimental_streamTranslate
description: API Reference for experimental_streamTranslate.
---

# `experimental_streamTranslate()`

<Note type="warning">
  `experimental_streamTranslate` is an experimental feature.
</Note>

Streams a speech-to-speech translation from live raw audio. Models translate
live source audio into target-language audio and text.

`experimental_streamTranslate` is built on the speech translation model
specification (`Experimental_SpeechTranslationModelV4`). Provider
implementations of the specification ship separately — see your provider's
documentation for available translation models.

```ts
import { experimental_streamTranslate as streamTranslate } from 'ai';

const result = streamTranslate({
  // any provider model instance that implements the experimental
  // speech translation model specification (Experimental_SpeechTranslationModelV4):
  model: translationModel,
  audio: audioStream, // ReadableStream<Uint8Array | string>
  inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
  targetLanguage: 'es',
});

for await (const part of result.fullStream) {
  if (part.type === 'output-text-delta') {
    process.stdout.write(part.delta);
  }
}

console.log(await result.translationText);
```

## Import

<Snippet
  text={`import { experimental_streamTranslate as streamTranslate } from "ai"`}
  prompt={false}
/>

## API Signature

### Parameters

<PropertiesTable
  content={[
    {
      name: 'model',
      type: 'Experimental_SpeechTranslationModelV4',
      description:
        'The speech translation model to use. Translation is a streaming-only modality. Pass a provider model instance that implements the experimental speech translation model specification. String model IDs resolve through the global provider (AI Gateway by default) when it supports speech translation models.',
    },
    {
      name: 'audio',
      type: 'ReadableStream<Uint8Array | string>',
      description:
        'Raw audio chunks to translate. `Uint8Array` chunks contain raw audio bytes; `string` chunks contain base64-encoded raw audio bytes.',
    },
    {
      name: 'inputAudioFormat',
      type: '{ type: string; rate?: number }',
      description:
        'The input audio format for the raw audio chunks, e.g. `{ type: "audio/pcm", rate: 24000 }`. Supported types are provider-specific (e.g. `audio/pcm`, `audio/pcmu`, `audio/pcma`).',
    },
    {
      name: 'targetLanguage',
      type: 'string',
      description:
        'The language to translate the audio into, as a BCP-47-style language tag (e.g. `en`, `es`, `fr-CA`). Supported values are provider-specific and validated by the provider.',
    },
    {
      name: 'sourceLanguage',
      type: 'string',
      isOptional: true,
      description:
        'The language of the source audio, as a BCP-47-style language tag. When absent, providers auto-detect the source language.',
    },
    {
      name: 'outputAudioFormat',
      type: '{ type: string; rate?: number }',
      isOptional: true,
      description:
        'The desired audio format for translated audio chunks. When absent, the provider default output format is used.',
    },
    {
      name: 'providerOptions',
      type: 'Record<string, JSONObject>',
      isOptional: true,
      description: 'Additional provider-specific options.',
    },
    {
      name: 'abortSignal',
      type: 'AbortSignal',
      isOptional: true,
      description: 'An optional abort signal to cancel the call.',
    },
    {
      name: 'headers',
      type: 'Record<string, string>',
      isOptional: true,
      description:
        'Additional HTTP/WebSocket headers, if supported by the provider.',
    },
    {
      name: 'includeRawChunks',
      type: 'boolean',
      isOptional: true,
      description:
        'When true, the provider includes raw provider chunks in the stream as `raw` parts.',
    },
  ]}
/>

### Returns

<PropertiesTable
  content={[
    {
      name: 'fullStream',
      type: 'AsyncIterableStream<TranslationStreamPart>',
      description:
        'A single-consumer live stream of translation parts: `audio`, `output-text-delta`, `output-text-final`, `source-transcript-delta`, `source-transcript-partial`, `source-transcript-final`, `raw`, and `error`. Access it once, before any result promise, when both stream parts and final results are needed. Accessing a result promise first consumes the stream internally and makes `fullStream` unavailable.',
    },
    {
      name: 'sourceText',
      type: 'Promise<string>',
      description: 'The final source-language transcript of the input audio.',
    },
    {
      name: 'translationText',
      type: 'Promise<string>',
      description:
        'The final translated text in the target language. May resolve to an empty string for providers that produce only audio output.',
    },
    {
      name: 'durationInSeconds',
      type: 'Promise<number | undefined>',
      description: 'The duration of the source audio in seconds, if available.',
    },
    {
      name: 'usage',
      type: 'Promise<Experimental_SpeechTranslationModelV4Usage | undefined>',
      description:
        'Usage information for the translation call, if reported by the provider: `inputAudioSeconds`, `inputAudioTokens`, `outputAudioTokens`, `inputTextTokens`, `outputTextTokens` (all optional numbers).',
    },
    {
      name: 'warnings',
      type: 'Promise<Warning[]>',
      description:
        'Warnings for the call, e.g. unsupported settings. Resolves at stream start, or with an empty array at finish if no stream-start was emitted.',
    },
    {
      name: 'response',
      type: 'Promise<SpeechTranslationModelResponseMetadata>',
      description: 'Response metadata (timestamp, model ID, headers).',
    },
    {
      name: 'providerMetadata',
      type: 'Promise<Record<string, JSONObject>>',
      description: 'Additional provider-specific metadata.',
    },
  ]}
/>

<Note>
  The result promises settle as the stream is consumed. If you stop consuming
  `fullStream` early (e.g. `break` out of the loop), the underlying provider
  connection is closed and pending result promises reject.
</Note>
