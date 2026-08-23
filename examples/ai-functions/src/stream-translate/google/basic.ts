import { google } from '@ai-sdk/google';
import { openai } from '@ai-sdk/openai';
import {
  experimental_streamTranslate as streamTranslate,
  generateSpeech,
} from 'ai';
import { run } from '../../lib/run';
import { resamplePcm16Mono } from './resample-pcm16-mono';

run(async () => {
  // generate raw PCM audio (24kHz, 16-bit, mono):
  const speech = await generateSpeech({
    model: openai.speech('tts-1'),
    text: 'Hello from the AI SDK! Streaming translation is experimental.',
    outputFormat: 'pcm',
  });

  // Gemini Live Translation requires 16kHz, 16-bit, mono PCM input:
  const bytes = resamplePcm16Mono(speech.audio.uint8Array, 24000, 16000);

  // stream the raw audio in chunks, as a microphone would:
  const chunkSize = 16 * 1024;
  const audio = new ReadableStream<Uint8Array>({
    start(controller) {
      for (let i = 0; i < bytes.length; i += chunkSize) {
        controller.enqueue(bytes.slice(i, i + chunkSize));
      }
      controller.close();
    },
  });

  const result = streamTranslate({
    model: google.translation('gemini-3.5-live-translate-preview'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    targetLanguage: 'es',
  });

  let translatedAudioBytes = 0;
  for await (const part of result.fullStream) {
    if (part.type === 'output-text-delta') {
      process.stdout.write(part.delta);
    }

    if (part.type === 'audio') {
      // translated audio chunk: play it or collect it for saving
      translatedAudioBytes +=
        typeof part.audio === 'string'
          ? Buffer.from(part.audio, 'base64').length
          : part.audio.length;
    }
  }
  console.log();

  console.log('Source text:', await result.sourceText);
  console.log('Translation:', await result.translationText);
  console.log('Translated audio bytes:', translatedAudioBytes);
  console.log('Usage:', await result.usage);
  console.log('Warnings:', await result.warnings);
});
