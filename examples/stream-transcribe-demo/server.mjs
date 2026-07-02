// Minimal local app to demo *streaming* speech-to-text via the AI SDK's
// `experimental_streamTranscribe`. The API key stays on this server and is
// never sent to the browser.
//
// Architecture (from https://github.com/vercel/ai/pull/16338):
//
//   browser mic --(16kHz PCM chunks over a WebSocket)--> this Node server
//     --> experimental_streamTranscribe({ model, audio, inputAudioFormat })
//       --> provider WebSocket (OpenAI gpt-realtime-whisper | xAI STT)
//     <-- transcript-delta / transcript-partial / transcript-final parts
//   browser <--(JSON transcript events over the same WebSocket)-- this server
//
// The browser captures mic audio, downsamples it to 16kHz signed 16-bit PCM,
// and streams raw chunks up. The server turns that socket into the
// `ReadableStream<Uint8Array>` that `experimental_streamTranscribe` consumes,
// then relays each transcript part back to the browser as it arrives.
import { createServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { openai } from '@ai-sdk/openai';
import { xai } from '@ai-sdk/xai';
import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { page } from './public/page.mjs';

const PORT = Number(process.env.PORT) || 5052;

// The two providers wired up in this demo. This is the whole point of the
// PR's API design: a single `experimental_streamTranscribe` entry point works
// across providers that have very different transports/capabilities.
//
// - OpenAI `gpt-realtime-whisper` is a *streaming-only* transcription model
//   (append-only `transcript-delta` tokens, then a single final).
// - xAI reuses the *same* `xai.transcription()` model as batch STT; streaming
//   is selected purely by calling `experimental_streamTranscribe` and tuned
//   via `providerOptions.xai.streaming` (interim/partial results, endpointing).
const PROVIDERS = {
  openai: {
    label: 'OpenAI gpt-realtime-whisper',
    envKey: 'OPENAI_API_KEY',
    // 24kHz tends to transcribe better for gpt-realtime-whisper.
    inputRate: 24000,
    createModel: () => openai.transcription('gpt-realtime-whisper'),
    providerOptions: ({ language }) => ({
      openai: {
        ...(language ? { language } : {}),
        streaming: { delay: 'low' },
      },
    }),
  },
  xai: {
    label: 'xAI Grok STT',
    envKey: 'XAI_API_KEY',
    inputRate: 16000,
    createModel: () => xai.transcription(),
    providerOptions: ({ language, keyterm }) => ({
      xai: {
        ...(language ? { language } : {}),
        ...(keyterm?.length ? { keyterm } : {}),
        streaming: { interimResults: true, endpointing: 500 },
      },
    }),
  },
};

const server = createServer((req, res) => {
  if (req.method === 'GET' && (req.url === '/' || req.url.startsWith('/?'))) {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(page);
    return;
  }

  if (req.method === 'GET' && req.url === '/providers') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(
      JSON.stringify(
        Object.entries(PROVIDERS).map(([id, cfg]) => ({
          id,
          label: cfg.label,
          inputRate: cfg.inputRate,
          available: Boolean(process.env[cfg.envKey]),
        })),
      ),
    );
    return;
  }

  res.writeHead(404, { 'content-type': 'text/plain' });
  res.end('not found');
});

// A single WebSocket per transcription session. The browser sends one JSON
// "start" text frame (provider + options), then a burst of binary PCM frames,
// then a JSON "stop" frame. We bridge that into the SDK's audio ReadableStream.
const wss = new WebSocketServer({ server, path: '/transcribe' });

wss.on('connection', socket => {
  /** @type {ReadableStreamDefaultController<Uint8Array> | null} */
  let audioController = null;
  let started = false;
  let closedAudio = false;
  const abortController = new AbortController();

  const send = message => {
    if (socket.readyState === socket.OPEN) {
      socket.send(JSON.stringify(message));
    }
  };

  const closeAudio = () => {
    if (closedAudio) return;
    closedAudio = true;
    try {
      audioController?.close();
    } catch {}
  };

  const start = async config => {
    if (started) return;
    started = true;

    const provider = PROVIDERS[config.provider] ?? PROVIDERS.openai;

    if (!process.env[provider.envKey]) {
      send({
        type: 'error',
        error: `${provider.envKey} is not set on the server.`,
      });
      socket.close();
      return;
    }

    // Audio arrives frame-by-frame from the browser; expose it as the raw
    // chunk stream `experimental_streamTranscribe` expects.
    const audio = new ReadableStream({
      start(controller) {
        audioController = controller;
      },
      cancel() {
        closedAudio = true;
      },
    });

    send({ type: 'status', status: 'connecting' });

    try {
      const result = streamTranscribe({
        model: provider.createModel(),
        audio,
        inputAudioFormat: { type: 'audio/pcm', rate: provider.inputRate },
        providerOptions: provider.providerOptions({
          language: config.language,
          keyterm: config.keyterm,
        }),
        abortSignal: abortController.signal,
      });

      send({ type: 'status', status: 'streaming' });

      // Relay every transcript part to the browser as it arrives. This is the
      // developer-facing surface of the PR: one uniform part stream regardless
      // of whether the provider emits deltas (OpenAI) or interim/final
      // partials per channel (xAI).
      for await (const part of result.fullStream) {
        switch (part.type) {
          case 'transcript-delta':
            send({ type: 'delta', delta: part.delta, id: part.id });
            break;
          case 'transcript-partial':
            send({
              type: 'partial',
              text: part.text,
              channelIndex: part.channelIndex,
            });
            break;
          case 'transcript-final':
            send({
              type: 'final',
              text: part.text,
              channelIndex: part.channelIndex,
            });
            break;
          case 'error':
            send({ type: 'error', error: formatError(part.error) });
            break;
        }
      }

      const [text, warnings] = await Promise.all([
        result.text,
        result.warnings,
      ]);
      send({ type: 'done', text, warnings });
    } catch (error) {
      send({ type: 'error', error: formatError(error) });
    } finally {
      if (socket.readyState === socket.OPEN) {
        socket.close();
      }
    }
  };

  socket.on('message', (data, isBinary) => {
    if (isBinary) {
      // Raw PCM chunk from the browser mic.
      if (audioController != null && !closedAudio) {
        audioController.enqueue(new Uint8Array(data));
      }
      return;
    }

    let message;
    try {
      message = JSON.parse(data.toString());
    } catch {
      return;
    }

    if (message.type === 'start') {
      void start(message);
    } else if (message.type === 'stop') {
      // User stopped talking: close the audio stream so the provider can emit
      // its final transcript and the async iterator above can complete.
      closeAudio();
    }
  });

  socket.on('close', () => {
    closeAudio();
    abortController.abort();
  });

  socket.on('error', () => {
    closeAudio();
    abortController.abort();
  });
});

function formatError(error) {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return JSON.stringify(error);
}

server.listen(PORT, () => {
  console.log(`streaming transcription demo: http://localhost:${PORT}`);
  const missing = Object.values(PROVIDERS)
    .filter(cfg => !process.env[cfg.envKey])
    .map(cfg => cfg.envKey);
  if (missing.length) {
    console.log(
      `Note: ${missing.join(', ')} not set; those providers are disabled.`,
    );
  }
});
