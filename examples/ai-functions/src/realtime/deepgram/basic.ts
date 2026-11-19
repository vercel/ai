import { deepgram, type DeepgramRealtimeModelOptions } from '@ai-sdk/deepgram';
import { parseJSON } from '@ai-sdk/provider-utils';
import { generateSpeech, type Experimental_RealtimeClientEvent } from 'ai';
import { WebSocket, type RawData } from 'ws';
import { run } from '../../lib/run';

const sampleRate = 24000;
// 100 ms of 16-bit mono PCM.
const frameBytes = (sampleRate / 10) * 2;

run(async () => {
  // Stands in for a microphone: a spoken question as raw PCM.
  const { audio: question } = await generateSpeech({
    model: deepgram.speech('aura-2'),
    voice: 'thalia',
    text: 'What is the capital of France?',
    outputFormat: 'pcm',
    providerOptions: { deepgram: { sampleRate } },
  });

  const model = deepgram.experimental_realtime('voice-agent');
  const { url, headers, protocols } = await model.getServerWebSocketConfig();
  const socket = new WebSocket(url, protocols, {
    headers,
    handshakeTimeout: 10_000,
  });
  const parse = model.createServerEventParser();
  let microphone: ReturnType<typeof setInterval> | undefined;

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
        const data = await model.serializeClientEvent(event);
        if (data == null) return;
        // Audio is sent as a binary frame, everything else as JSON.
        socket.send(data instanceof Uint8Array ? data : JSON.stringify(data));
      };
      const streamMicrophone = () => {
        let offset = 0;
        // The agent expects a continuous stream, so silence follows the
        // question, as it would from an open microphone.
        microphone = setInterval(() => {
          const frame = new Uint8Array(frameBytes);
          frame.set(question.uint8Array.subarray(offset, offset + frameBytes));
          offset += frameBytes;
          send({
            type: 'input-audio-append',
            audio: Buffer.from(frame).toString('base64'),
          }).catch(finish);
        }, 100);
      };

      let agentAudioBytes = 0;
      const handle = async (data: RawData, isBinary: boolean) => {
        // Agent audio arrives as binary frames, everything else as JSON.
        const raw = isBinary
          ? data
          : await parseJSON({ text: data.toString() });
        const events = parse(raw);
        for (const event of Array.isArray(events) ? events : [events]) {
          switch (event.type) {
            case 'session-created':
              await send({
                type: 'session-update',
                config: {
                  instructions: 'Answer in one short sentence.',
                  inputAudioFormat: { type: 'audio/pcm', rate: sampleRate },
                  outputAudioFormat: { type: 'audio/pcm', rate: sampleRate },
                  providerOptions: {
                    deepgram: {
                      // The LLM the agent thinks with. Listening and speaking
                      // default to Deepgram Flux.
                      think: { provider: 'open_ai', model: 'gpt-4o-mini' },
                    } satisfies DeepgramRealtimeModelOptions,
                  },
                },
              });
              break;
            case 'session-updated':
              streamMicrophone();
              break;
            case 'input-transcription-completed':
              console.log('User:', event.transcript);
              break;
            case 'audio-delta':
              agentAudioBytes += Buffer.from(event.delta, 'base64').length;
              break;
            case 'audio-transcript-done':
              console.log('Agent:', event.transcript);
              break;
            case 'response-done':
              console.log(
                `Agent audio: ${(agentAudioBytes / (sampleRate * 2)).toFixed(1)}s of PCM`,
              );
              finish();
              break;
            case 'error':
              finish(new Error(event.message));
              break;
          }
        }
      };

      // The parser tracks the agent's turn across frames, so frames must be
      // handled strictly in the order they arrive.
      let queue = Promise.resolve();
      socket.on('message', (data, isBinary) => {
        queue = queue.then(() => handle(data, isBinary)).catch(finish);
      });
      socket.on('error', finish);
      socket.on('close', () =>
        finish(new Error('Socket closed before completion')),
      );
    });
  } finally {
    clearInterval(microphone);
    socket.terminate();
  }
});
