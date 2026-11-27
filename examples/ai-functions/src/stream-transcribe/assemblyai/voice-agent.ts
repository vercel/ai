import { assemblyai } from '@ai-sdk/assemblyai';
import {
  experimental_streamTranscribe as streamTranscribe,
  generateSpeech,
} from 'ai';
import { setTimeout as delay } from 'node:timers/promises';
import { run } from '../../lib/run';

// Turn-based voice agent input: AssemblyAI-STT-3.7-Realtime-Agent detects the
// end of each user turn, so every `transcript-final` part is one complete user
// turn that can be handed to an LLM. `SpeechStarted` raw chunks mark the start
// of user speech (a barge-in signal for interrupting the agent's own audio).
run(async () => {
  const greeting = 'Thanks for calling. What can I help you with today?';

  // Simulate a caller with two utterances separated by a pause.
  const utterances = [
    'Hi, I would like to check on the status of my order.',
    'The order number is 7 2 9 4 1.',
  ];
  const pause = new Uint8Array(16000 * 2 * 2); // 2 s of 16 kHz PCM silence
  const chunks: Uint8Array[] = [];
  for (const text of utterances) {
    const speech = await generateSpeech({
      model: assemblyai.speech('assemblyai-tts-1'),
      text,
      voice: 'aai-kyla',
      outputFormat: 'pcm',
      providerOptions: { assemblyai: { sampleRate: 16000 } },
    });
    chunks.push(speech.audio.uint8Array, pause);
  }
  const bytes = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let position = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, position);
    position += chunk.length;
  }

  // 100 ms of 16 kHz, 16-bit mono PCM, paced like microphone input.
  const chunkSize = 3200;
  let offset = 0;
  const audio = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
      await delay(100);
    },
  });

  const result = streamTranscribe({
    model: assemblyai.transcription('assemblyai-stt-3-7-realtime-agent'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    includeRawChunks: true,
    providerOptions: {
      assemblyai: {
        streaming: {
          // Seed the model with the agent's opening line as context.
          agentContext: greeting,
          mode: 'balanced',
        },
      },
    },
    abortSignal: AbortSignal.timeout(60000),
  });

  console.log(`Agent: ${greeting}`);
  for await (const part of result.fullStream) {
    if (part.type === 'error') throw part.error;
    if (
      part.type === 'raw' &&
      (part.rawValue as { type?: string }).type === 'SpeechStarted'
    ) {
      console.log('(user started speaking: stop agent playback)');
    }
    if (part.type === 'transcript-final' && part.text.length > 0) {
      console.log(`User turn: ${part.text}`);
      console.log('  -> hand this turn to your LLM, then speak its reply');
    }
  }
});
