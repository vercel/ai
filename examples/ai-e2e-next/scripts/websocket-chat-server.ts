import { createServer } from 'node:http';
import { openai } from '@ai-sdk/openai';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import {
  convertToModelMessages,
  generateId,
  safeValidateWebSocketChatTransportRequest,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type UIMessageChunk,
  type WebSocketChatTransportRequest,
  type WebSocketChatTransportResponse,
} from 'ai';
import { WebSocket, WebSocketServer } from 'ws';
import { tools, type WebSocketChatMessage } from '../app/chat/websocket/tools';
import { mockModel } from './websocket-chat-mock-model';

const port = Number(process.env.WEBSOCKET_CHAT_PORT ?? 3001);
const origin = process.env.WEBSOCKET_CHAT_ORIGIN ?? 'http://localhost:3000';
const model =
  process.env.WEBSOCKET_CHAT_MOCK === '1' ? mockModel : openai('gpt-6-luna');

type RetainedStream = {
  controller: AbortController;
  chunks: UIMessageChunk[];
  subscribers: Map<WebSocket, string>;
  ended: boolean;
};

// Local demonstration only: session IDs isolate tabs but are not authentication.
// A deployed server must derive this scope from an authenticated user.
const sessions = new Map<
  string,
  { streams: Map<string, RetainedStream>; connections: Set<WebSocket> }
>();
const server = createServer((request, response) => {
  response.writeHead(request.url === '/health' ? 200 : 404);
  response.end();
});
const sockets = new WebSocketServer({
  server,
  path: '/chat',
  maxPayload: 1024 * 1024,
  verifyClient: (info: { origin: string }) => info.origin === origin,
});

function send(socket: WebSocket, frame: WebSocketChatTransportResponse) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
}

sockets.on('connection', (socket, request) => {
  const sessionId = new URL(
    request.url ?? '/',
    'http://localhost',
  ).searchParams.get('session');
  if (sessionId == null || !/^[\w-]{1,64}$/.test(sessionId)) {
    socket.close(1008, 'Invalid session');
    return;
  }
  const session = sessions.get(sessionId) ?? {
    streams: new Map<string, RetainedStream>(),
    connections: new Set<WebSocket>(),
  };
  const { streams, connections } = session;
  sessions.set(sessionId, session);
  connections.add(socket);

  function remove(chatId: string, stream: RetainedStream) {
    if (streams.get(chatId) === stream) streams.delete(chatId);
    if (streams.size === 0 && connections.size === 0)
      sessions.delete(sessionId!);
  }

  async function generate(
    frame: Extract<
      WebSocketChatTransportRequest<WebSocketChatMessage>,
      { type: 'send' }
    >,
    retained: RetainedStream,
  ) {
    const timeout = setTimeout(() => retained.controller.abort(), 120_000);
    let reader: ReadableStreamDefaultReader<UIMessageChunk> | undefined;
    try {
      const messages = await validateUIMessages<WebSocketChatMessage>({
        messages: frame.messages,
        tools,
      });
      const result = streamText({
        model,
        messages: await convertToModelMessages(messages),
        tools,
        abortSignal: retained.controller.signal,
      });
      const stream = toUIMessageStream({
        stream: result.stream,
        originalMessages: messages,
        generateMessageId: generateId,
      });
      reader = stream.getReader();
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done || retained.controller.signal.aborted) break;
        const sequence = retained.chunks.length;
        retained.chunks.push(chunk);
        retained.subscribers.forEach((requestId, subscriber) => {
          send(subscriber, { type: 'chunk', requestId, sequence, chunk });
        });
      }
      retained.ended = true;
      retained.subscribers.forEach((requestId, subscriber) => {
        send(subscriber, { type: 'end', requestId });
      });
      if (retained.controller.signal.aborted) remove(frame.id, retained);
      else setTimeout(() => remove(frame.id, retained), 60_000).unref();
    } catch (error) {
      remove(frame.id, retained);
      console.error(error);
      retained.subscribers.forEach((requestId, subscriber) => {
        send(subscriber, {
          type: 'error',
          requestId,
          errorText: 'Chat request failed.',
        });
      });
    } finally {
      clearTimeout(timeout);
      reader?.releaseLock();
      retained.subscribers.clear();
    }
  }

  async function handle(text: string) {
    const parsed = await safeParseJSON({ text });
    const validated = parsed.success
      ? await safeValidateWebSocketChatTransportRequest<WebSocketChatMessage>({
          value: parsed.value,
        })
      : undefined;
    if (!validated?.success) {
      socket.close(1008, 'Invalid frame');
      return;
    }
    const frame = validated.data;
    if (frame.type === 'abort') {
      streams.forEach((stream, chatId) => {
        if (stream.subscribers.get(socket) === frame.requestId) {
          stream.controller.abort();
          remove(chatId, stream);
        }
      });
      return;
    }
    if (frame.type === 'resume') {
      const stream = streams.get(frame.id);
      if (stream == null) {
        send(socket, { type: 'no-active', requestId: frame.requestId });
        return;
      }
      send(socket, { type: 'start', requestId: frame.requestId });
      // Chat needs the full replay, including the original assistant ID.
      stream.chunks.forEach((chunk, sequence) => {
        send(socket, {
          type: 'chunk',
          requestId: frame.requestId,
          sequence,
          chunk,
        });
      });
      if (stream.ended)
        send(socket, { type: 'end', requestId: frame.requestId });
      else stream.subscribers.set(socket, frame.requestId);
      return;
    }
    if (streams.get(frame.id)?.ended === false) {
      send(socket, {
        type: 'error',
        requestId: frame.requestId,
        errorText: 'A response is already active.',
      });
      return;
    }
    const stream: RetainedStream = {
      controller: new AbortController(),
      chunks: [],
      subscribers: new Map([[socket, frame.requestId]]),
      ended: false,
    };
    streams.set(frame.id, stream);
    // Do not await generation here: abort and resume frames must remain usable.
    void generate(frame, stream);
  }

  // Serialize asynchronous frame validation without blocking ongoing generation.
  let incoming = Promise.resolve();
  socket.on('message', data => {
    incoming = incoming
      .then(() => handle(data.toString()))
      .catch(error => {
        console.error(error);
        socket.close(1011, 'Chat connection failed.');
      });
  });
  socket.on('error', console.error);
  socket.on('close', () => {
    streams.forEach(stream => stream.subscribers.delete(socket));
    connections.delete(socket);
    if (streams.size === 0 && connections.size === 0)
      sessions.delete(sessionId);
  });
});

server.listen(port, '127.0.0.1', () => {
  console.log(`WebSocket chat listening at ws://127.0.0.1:${port}/chat`);
});

function shutdown() {
  sessions.forEach(({ streams }) => {
    streams.forEach(stream => stream.controller.abort());
  });
  sockets.clients.forEach(socket => socket.terminate());
  sockets.close();
  server.close();
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
