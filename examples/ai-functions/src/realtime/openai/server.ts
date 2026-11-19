import { openai } from '@ai-sdk/openai';
import { parseJSON } from '@ai-sdk/provider-utils';
import type { Experimental_RealtimeClientEvent } from 'ai';
import { WebSocket } from 'ws';
import { run } from '../../lib/run';

run(async () => {
  const model = openai.experimental_realtime('gpt-realtime-2.1', {
    api: 'realtime',
  });
  const options = { intent: 'conversation' } as const;
  const { url, headers, protocols } =
    await model.getServerWebSocketConfig(options);
  const socket = new WebSocket(url, protocols, {
    headers,
    handshakeTimeout: 10_000,
  });

  try {
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('Session timed out')),
        30_000,
      );
      const finish = (error?: Error) => {
        clearTimeout(timeout);
        if (error) reject(error);
        else resolve();
      };
      const send = async (event: Experimental_RealtimeClientEvent) => {
        socket.send(
          JSON.stringify(await model.serializeClientEvent(event, options)),
        );
      };
      socket.on('error', finish);
      socket.on('close', () =>
        finish(new Error('Socket closed before completion')),
      );
      socket.on('message', data => {
        void (async () => {
          const raw = await parseJSON({ text: data.toString() });
          // OpenAI Realtime's codec is stateless. For stateful models, create
          // one createServerEventParser() parser per socket instead.
          const event = model.parseServerEvent(raw);
          if (event.type === 'session-created') {
            await send({
              type: 'session-update',
              config: {
                outputModalities: ['text'],
                instructions: 'Reply with OK only.',
              },
            });
          } else if (event.type === 'session-updated') {
            await send({
              type: 'conversation-item-create',
              item: {
                type: 'text-message',
                role: 'user',
                text: 'Reply with OK only.',
              },
            });
            await send({
              type: 'response-create',
              options: { modalities: ['text'] },
            });
          } else if (event.type === 'text-delta') {
            process.stdout.write(event.delta);
          } else if (event.type === 'response-done') {
            console.log('\nUsage:', event.usage);
            finish();
          } else if (event.type === 'error') {
            finish(new Error(event.message));
          }
        })().catch(finish);
      });
    });
  } finally {
    socket.terminate();
  }
});
