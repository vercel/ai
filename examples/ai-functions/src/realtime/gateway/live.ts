import { gateway } from '@ai-sdk/gateway';
import { parseJSON } from '@ai-sdk/provider-utils';
import type { Experimental_RealtimeClientEvent } from 'ai';
import { WebSocket } from 'ws';
import { run } from '../../lib/run';

// 20 ms of silent mono PCM16 at 24 kHz; replace with microphone audio.
const silence = Buffer.alloc(960).toString('base64');

run(async () => {
  const model = gateway.experimental_realtime('openai/gpt-live-1.1');
  const options = { intent: 'conversation' } as const;
  const { url, headers } = await model.getServerWebSocketConfig(options);
  const socket = new WebSocket(url, { headers, handshakeTimeout: 10_000 });

  await new Promise<void>((resolve, reject) => {
    let audioTimer: ReturnType<typeof setInterval> | undefined;
    let quietTimer: ReturnType<typeof setTimeout> | undefined;
    let outputBytes = 0;
    let done = false;
    const timeout = setTimeout(
      () => finish(new Error('Session timed out')),
      60_000,
    );
    // Settle once and always end the billable session.
    const finish = (error?: Error) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      clearTimeout(quietTimer);
      clearInterval(audioTimer);
      if (socket.readyState === WebSocket.OPEN) socket.close(1000);
      else socket.terminate();
      if (error) reject(error);
      else resolve();
    };
    const send = async (event: Experimental_RealtimeClientEvent) => {
      const frame = JSON.stringify(
        await model.serializeClientEvent(event, options),
      );
      if (done || socket.readyState !== WebSocket.OPEN) return;
      socket.send(frame);
    };

    socket.on('open', () => {
      void send({
        type: 'session-start',
        config: {
          instructions: 'Keep replies to one short sentence.',
          inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
          outputAudioFormat: { type: 'audio/pcm', rate: 24000 },
        },
      });
    });
    socket.on('error', finish);
    socket.on('close', () =>
      finish(new Error('Socket closed before final usage')),
    );
    socket.on('message', data => {
      if (done) return;
      void (async () => {
        const raw = await parseJSON({ text: data.toString() });
        // Gateway sends normalized events, so parsing is stateless.
        const event = model.parseServerEvent(raw);
        if (done) return;
        switch (event.type) {
          case 'session-started':
            console.log('Session started:', event.sessionId);
            await send({
              type: 'context-append',
              content: 'Greet the caller now, then listen.',
              delegationId: null,
              providerOptions: { openai: { channel: 'instructions' } },
            });
            // Another frame may have finished the session during the await.
            if (done) break;
            audioTimer = setInterval(
              () => void send({ type: 'input-audio-append', audio: silence }),
              20,
            );
            break;
          case 'audio-chunk':
            outputBytes += Buffer.from(event.delta, 'base64').length;
            break;
          case 'transcript-fragment':
            if (event.speaker === 'assistant') {
              process.stdout.write(event.delta);
              // Close once the spoken reply has finished.
              if (done) break;
              clearTimeout(quietTimer);
              quietTimer = setTimeout(
                () => void send({ type: 'session-close' }),
                4_000,
              );
            }
            break;
          case 'session-closed':
            console.log('\nOutput audio bytes:', outputBytes);
            console.log('Final usage:', event.usage);
            finish();
            break;
          case 'error':
            finish(new Error(event.message));
            break;
        }
      })().catch(finish);
    });
  });
});
