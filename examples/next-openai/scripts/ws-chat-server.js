/* Minimal WebSocket server for demoing WebSocketChatTransport. */
const { WebSocketServer } = require('ws');

const PORT = process.env.WS_PORT ? Number(process.env.WS_PORT) : 8787;
const wss = new WebSocketServer({ port: PORT });

function send(ws, message) {
  try {
    ws.send(JSON.stringify(message));
  } catch {}
}

wss.on('connection', ws => {
  ws.on('message', data => {
    let inbound;
    try {
      inbound = JSON.parse(data.toString());
    } catch {
      return;
    }

    const requestId = inbound.requestId || '';

    switch (inbound.type) {
      case 'send': {
        // Use AI SDK to stream model output and forward UIMessageChunks over WS
        (async () => {
          try {
            const { streamText, convertToModelMessages } = await import('ai');
            const { openai } = await import('@ai-sdk/openai');

            const uiMessages = Array.isArray(inbound.messages) ? inbound.messages : [];
            const result = streamText({
              model: openai('gpt-4o-mini'),
              messages: convertToModelMessages(uiMessages),
            });

            const stream = result.toUIMessageStream();
            const reader = stream.getReader();

            try {
              while (true) {
                const { value, done } = await reader.read();
                if (done) break;
                send(ws, { type: 'chunk', requestId, chunk: value });
              }
              send(ws, { type: 'end', requestId });
            } finally {
              reader.releaseLock?.();
            }
          } catch (err) {
            send(ws, { type: 'error', requestId, errorText: String(err?.message || err) });
          }
        })();
        break;
      }

      case 'resume': {
        // Minimal behavior: no active stream
        send(ws, { type: 'no-active', requestId });
        break;
      }

      case 'abort': {
        // No-op in this minimal server
        break;
      }

      default:
        break;
    }
  });
});

console.log(`[ws-chat-server] listening on wss://localhost:${PORT}`);
