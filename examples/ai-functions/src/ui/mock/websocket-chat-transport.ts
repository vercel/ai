import {
  safeParseJSON,
  type WebSocketConstructor,
} from '@ai-sdk/provider-utils';
import {
  WebSocketChatTransport,
  type UIMessage,
  type WebSocketChatTransportRequest,
  type WebSocketChatTransportResponse,
} from 'ai';
import { WebSocket, WebSocketServer } from 'ws';

function send(
  socket: WebSocket,
  response: WebSocketChatTransportResponse,
): void {
  socket.send(JSON.stringify(response));
}

const server = new WebSocketServer({ port: 0 });
await new Promise<void>(resolve => server.once('listening', resolve));

let connectionCount = 0;
server.on('connection', socket => {
  connectionCount++;

  socket.on('message', async data => {
    const parsed = await safeParseJSON({ text: data.toString() });
    if (!parsed.success) {
      socket.close(1008, 'Invalid JSON');
      return;
    }

    const request = parsed.value as WebSocketChatTransportRequest<UIMessage>;

    if (request.type === 'resume') {
      send(socket, {
        type: 'no-active',
        requestId: request.requestId,
      });
      return;
    }

    if (request.type !== 'send') {
      return;
    }

    const lastMessage = request.messages.at(-1);
    const prompt =
      lastMessage?.parts.find(part => part.type === 'text')?.text ?? 'unknown';
    const textId = `text-${request.requestId}`;

    send(socket, {
      type: 'chunk',
      requestId: request.requestId,
      chunk: { type: 'text-start', id: textId },
    });
    send(socket, {
      type: 'chunk',
      requestId: request.requestId,
      chunk: {
        type: 'text-delta',
        id: textId,
        delta: `Received: ${prompt}`,
      },
    });
    send(socket, {
      type: 'chunk',
      requestId: request.requestId,
      chunk: { type: 'text-end', id: textId },
    });
    send(socket, { type: 'end', requestId: request.requestId });
  });
});

const address = server.address();
if (typeof address === 'string' || address == null) {
  throw new Error('Expected the WebSocket server to use a TCP port.');
}

const transport = new WebSocketChatTransport<UIMessage>({
  url: `ws://127.0.0.1:${address.port}`,
  webSocket: WebSocket as unknown as WebSocketConstructor,
});

async function sendMessage(text: string): Promise<string> {
  const stream = await transport.sendMessages({
    chatId: 'example-chat',
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

  let response = '';
  const reader = stream.getReader();
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }
      if (value.type === 'text-delta') {
        response += value.delta;
      }
    }
  } finally {
    reader.releaseLock();
  }
  return response;
}

try {
  console.log(await sendMessage('first turn'));
  console.log(await sendMessage('second turn'));
  console.log(`WebSocket connections opened: ${connectionCount}`);
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
