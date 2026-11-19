import { deepgram } from '@ai-sdk/deepgram';
import {
  experimental_streamTranscribe as streamTranscribe,
  generateSpeech,
} from 'ai';
import { setTimeout as delay } from 'node:timers/promises';
import { run } from '../../lib/run';

run(async () => {
  // A Spanish Flux TTS voice produces the test audio: raw 16 kHz PCM.
  const speech = await generateSpeech({
    model: deepgram.speech('flux'),
    voice: 'carmen',
    language: 'es',
    text: '¡Hola! Esta es una prueba de transcripción multilingüe con Flux.',
    outputFormat: 'pcm',
    providerOptions: { deepgram: { sampleRate: 16000 } },
  });

  // Two seconds of trailing silence let Flux end the turn on its own.
  const bytes = new Uint8Array(speech.audio.uint8Array.length + 64000);
  bytes.set(speech.audio.uint8Array);
  const chunkSize = 2560; // 80ms of 16 kHz, 16-bit mono PCM
  let offset = 0;
  const audio = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= bytes.length) {
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
      await delay(80);
    },
  });

  const result = streamTranscribe({
    model: deepgram.transcription('flux-general-multi'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    providerOptions: {
      // Hints bias detection toward the expected languages; without them
      // Flux Multilingual detects the language on its own.
      deepgram: { streaming: { languageHints: ['en', 'es'] } },
    },
    abortSignal: AbortSignal.timeout(60000),
  });

  for await (const part of result.fullStream) {
    if (part.type === 'error') throw part.error;
    if (part.type === 'transcript-final') {
      console.log(
        'final:',
        JSON.stringify(part.text),
        'languages:',
        part.providerMetadata?.deepgram?.languages,
      );
    }
  }

  console.log('Text:', await result.text);
  console.log('Language:', await result.language);
  console.log('Duration:', await result.durationInSeconds);
});
