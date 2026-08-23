import { openai } from '@ai-sdk/openai';
import {
  experimental_streamTranslate as streamTranslate,
  generateSpeech,
} from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // generate raw PCM audio (24kHz, 16-bit, mono) to translate:
  const speech = await generateSpeech({
    model: openai.speech('tts-1'),
    text: 'Hello from the AI SDK! Streaming translation is experimental.',
    outputFormat: 'pcm',
  });

  // stream the raw audio in chunks, as a microphone would:
  const bytes = speech.audio.uint8Array;
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
    model: openai.translation('gpt-realtime-translate'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
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
  console.log('Duration:', await result.durationInSeconds);
  console.log('Usage:', await result.usage);
  console.log('Warnings:', await result.warnings);
  console.log('Response:', await result.response);
});
