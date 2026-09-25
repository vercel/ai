import {
  safeParseJSON,
  type WebSocketConstructor,
} from '@ai-sdk/provider-utils';
import {
  safeValidateWebSocketChatTransportRequest,
  WebSocketChatTransport,
  type UIMessage,
  type UIMessageChunk,
  type WebSocketChatTransportResponse,
} from 'ai';
import { WebSocket, WebSocketServer } from 'ws';

type StoredChunk = {
  sequence: number;
  chunk: UIMessageChunk;
};

type RetainedStream = {
  chunks: StoredChunk[];
  ended: boolean;
  subscribers: Map<WebSocket, string>;
};

function send(
  socket: WebSocket,
  response: WebSocketChatTransportResponse,
): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(response));
  }
}

function publish(stream: RetainedStream, chunk: UIMessageChunk): void {
  const stored = { sequence: stream.chunks.length, chunk };
  stream.chunks.push(stored);
  for (const [socket, requestId] of stream.subscribers) {
    send(socket, { type: 'chunk', requestId, ...stored });
  }
}

function finish(stream: RetainedStream): void {
  stream.ended = true;
  for (const [socket, requestId] of stream.subscribers) {
    send(socket, { type: 'end', requestId });
  }
  stream.subscribers.clear();
}

const server = new WebSocketServer({ port: 0 });
await new Promise<void>(resolve => server.once('listening', resolve));

const streamsBySession = new Map<string, Map<string, RetainedStream>>();
let connectionCount = 0;
let latestServerSocket: WebSocket | undefined;

server.on('connection', (socket, request) => {
  const requestUrl = new URL(request.url ?? '/', 'ws://localhost');
  const sessionId = requestUrl.searchParams.get('session');

  // A production server should authenticate the handshake, validate Origin,
  // and derive this scope from the authenticated user instead of trusting it.
  if (sessionId !== 'example-session') {
    socket.close(1008, 'Unauthorized');
    return;
  }

  connectionCount++;
  latestServerSocket = socket;
  const sessionStreams =
    streamsBySession.get(sessionId) ?? new Map<string, RetainedStream>();
  streamsBySession.set(sessionId, sessionStreams);

  socket.on('close', () => {
    for (const stream of sessionStreams.values()) {
      stream.subscribers.delete(socket);
    }
  });

  socket.on('message', async data => {
    const parsed = await safeParseJSON({ text: data.toString() });
    if (!parsed.success) {
      socket.close(1008, 'Invalid frame');
      return;
    }

    const validated =
      await safeValidateWebSocketChatTransportRequest<UIMessage>({
        value: parsed.value,
      });
    if (!validated.success) {
      socket.close(1008, 'Invalid frame');
      return;
    }
    const frame = validated.data;

    if (frame.type === 'abort') {
      for (const stream of sessionStreams.values()) {
        if (stream.subscribers.get(socket) === frame.requestId) {
          stream.subscribers.delete(socket);
        }
      }
      return;
    }

    if (frame.type === 'resume') {
      const stream = sessionStreams.get(frame.id);
      if (stream == null) {
        send(socket, { type: 'no-active', requestId: frame.requestId });
        return;
      }

      send(socket, { type: 'start', requestId: frame.requestId });
      if (!stream.ended) {
        stream.subscribers.set(socket, frame.requestId);
      }
      for (const stored of stream.chunks) {
        if (stored.sequence > (frame.lastSequence ?? -1)) {
          send(socket, {
            type: 'chunk',
            requestId: frame.requestId,
            ...stored,
          });
        }
      }
      if (stream.ended) {
        send(socket, { type: 'end', requestId: frame.requestId });
      }
      return;
    }

    const lastMessage = frame.messages.at(-1);
    const prompt =
      lastMessage?.parts.find(part => part.type === 'text')?.text ?? 'unknown';
    const textId = `text-${frame.requestId}`;
    const stream: RetainedStream = {
      chunks: [],
      ended: false,
      subscribers: new Map([[socket, frame.requestId]]),
    };
    sessionStreams.set(frame.id, stream);

    publish(stream, { type: 'text-start', id: textId });

    const complete = () => {
      publish(stream, {
        type: 'text-delta',
        id: textId,
        delta: `Received: ${prompt}`,
      });
      publish(stream, { type: 'text-end', id: textId });
      finish(stream);
    };

    if (prompt === 'resumable turn') {
      setTimeout(complete, 25);
    } else {
      complete();
    }
  });
});

const address = server.address();
if (typeof address === 'string' || address == null) {
  throw new Error('Expected the WebSocket server to use a TCP port.');
}

const transport = new WebSocketChatTransport<UIMessage>({
  url: `ws://127.0.0.1:${address.port}`,
  params: { session: 'example-session' },
  webSocket: WebSocket as unknown as WebSocketConstructor,
});

async function startMessage(chatId: string, text: string) {
  return transport.sendMessages({
    chatId,
    trigger: 'submit-message',
    messageId: undefined,
    messages: [
      {
        id: crypto.randomUUID(),
        role: 'user',
        parts: [{ type: 'text', text }],
      },
    ],
    abortSignal: undefined,
  });
}

async function readText(
  stream: ReadableStream<UIMessageChunk>,
): Promise<string> {
  let response = '';
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        return response;
      }
      if (value.type === 'text-delta') {
        response += value.delta;
      }
    }
  } finally {
    reader.releaseLock();
  }
}

try {
  console.log(await readText(await startMessage('chat-1', 'first turn')));
  console.log(await readText(await startMessage('chat-1', 'second turn')));
  console.log(`WebSocket connections before resume: ${connectionCount}`);

  const interrupted = (
    await startMessage('resumable-chat', 'resumable turn')
  ).getReader();
  await interrupted.read();
  latestServerSocket?.terminate();
  await interrupted.read().catch(() => undefined);
  await new Promise(resolve => setTimeout(resolve, 30));

  const resumed = await transport.reconnectToStream({
    chatId: 'resumable-chat',
  });
  if (resumed == null) {
    throw new Error('Expected a retained stream to resume.');
  }
  console.log(`Resumed: ${await readText(resumed)}`);
  console.log(`WebSocket connections after resume: ${connectionCount}`);
} finally {
  transport.close();
  await new Promise<void>((resolve, reject) => {
    server.close(error => {
      if (error == null) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}
