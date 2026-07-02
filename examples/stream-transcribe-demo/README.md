# Streaming Transcription Demo

A minimal local browser app that demonstrates **streaming speech-to-text** via
the AI SDK's `experimental_streamTranscribe`
([vercel/ai#16338](https://github.com/vercel/ai/pull/16338)).

It showcases the key idea of the API design: a **single entry point**
(`experimental_streamTranscribe`) works across providers with very different
transports and capabilities, without introducing a new "realtime transcription
model" type.

- **OpenAI `gpt-realtime-whisper`** — a *streaming-only* transcription model.
  Emits append-only `transcript-delta` tokens, then a single final. Selected
  with `openai.transcription('gpt-realtime-whisper')`.
- **xAI Grok STT** — reuses the *same* `xai.transcription()` model as batch STT.
  Streaming is selected purely by calling `experimental_streamTranscribe`
  instead of `transcribe`, and tuned via `providerOptions.xai.streaming`
  (interim/partial results, endpointing, multichannel).

## How it works

```
browser mic --(16-bit PCM chunks over a WebSocket)--> Node server
  --> experimental_streamTranscribe({ model, audio, inputAudioFormat, providerOptions })
    --> provider WebSocket (OpenAI gpt-realtime-whisper | xAI STT)
  <-- transcript-delta / transcript-partial / transcript-final parts
browser <--(JSON transcript events over the same WebSocket)-- Node server
```

The browser captures mic audio, downsamples it to signed 16-bit little-endian
PCM at the provider's expected sample rate, and streams raw chunks up over a
WebSocket. The server turns that socket into the `ReadableStream<Uint8Array>`
that `experimental_streamTranscribe` consumes, then relays each transcript part
back to the browser as it arrives.

The API key stays on the server and is never sent to the browser.

## Usage

1. Copy `.env.example` to `.env` and set a key for the provider(s) you want to
   try:

   ```sh
   OPENAI_API_KEY=...   # for gpt-realtime-whisper
   XAI_API_KEY=...      # for xAI Grok STT
   ```

2. From the repo root, install and build workspace deps:

   ```sh
   pnpm install
   ```

3. Start the demo (the `prestart` script builds `ai`, `@ai-sdk/openai`, and
   `@ai-sdk/xai`):

   ```sh
   pnpm --filter @example/stream-transcribe-demo start
   ```

4. Open http://localhost:5052, pick a provider, and click **Start recording**.
   Speak, then click **Stop recording** to flush the final transcript.

## Files

- `server.mjs` — Node HTTP + WebSocket server. Bridges the browser audio socket
  into `experimental_streamTranscribe` and relays transcript parts back.
- `public/page.mjs` — the HTML page (served as a string).
- `public/client.mjs` — browser-side mic capture, PCM downsampling, and
  transcript rendering.

## See also

CLI examples of the same API live in
`examples/ai-functions/src/stream-transcribe/` (OpenAI and xAI, including
multichannel and raw-chunk debugging).
