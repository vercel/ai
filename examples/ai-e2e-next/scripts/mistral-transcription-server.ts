import { createMistral, type MistralProviderSettings } from '@ai-sdk/mistral';
import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { WebSocket, WebSocketServer } from 'ws';

const mistral = createMistral({
  webSocket: WebSocket as unknown as MistralProviderSettings['webSocket'],
});
// Local demo: keep the API key here and accept only our local app's origin.
const server = new WebSocketServer({
  host: '127.0.0.1',
  port: 3002,
  maxPayload: 64 * 1024,
  verifyClient: ({ origin }: { origin: string }) =>
    origin === 'http://localhost:3000',
});

server.on('connection', socket => {
  const abort = new AbortController();
  let input!: ReadableStreamDefaultController<Uint8Array>;
  let ended = false;
  const audio = new ReadableStream<Uint8Array>({
    start(controller) {
      input = controller;
    },
    cancel() {
      ended = true;
    },
  });
  socket.binaryType = 'arraybuffer';
  socket.on('message', (data, binary) => {
    if (ended) return;
    if (binary) input.enqueue(new Uint8Array(data as ArrayBuffer));
    else if (data.toString() === 'stop') {
      ended = true;
      input.close();
    }
  });
  socket.on('close', () => abort.abort());
  socket.on('error', () => abort.abort());
  const send = (type: string, text: string) => {
    if (socket.readyState === WebSocket.OPEN)
      socket.send(JSON.stringify({ type, text }));
  };

  void (async () => {
    try {
      const result = streamTranscribe({
        model: mistral.transcription('voxtral-mini-transcribe-realtime-3'),
        audio,
        inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
        abortSignal: abort.signal,
      });
      for await (const part of result.fullStream) {
        if (part.type === 'error') throw part.error;
        if (part.type === 'transcript-delta') send('delta', part.delta);
      }
      send('done', await result.text);
    } catch (error) {
      send('error', error instanceof Error ? error.message : String(error));
    } finally {
      socket.close();
    }
  })();
});
server.on('listening', () =>
  console.log('Transcription relay: ws://localhost:3002'),
);
