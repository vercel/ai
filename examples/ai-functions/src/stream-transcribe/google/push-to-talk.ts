import { google } from '@ai-sdk/google';
import { xai } from '@ai-sdk/xai';
import {
  experimental_streamTranscribe as streamTranscribe,
  generateSpeech,
} from 'ai';
import { setTimeout as delay } from 'node:timers/promises';
import { run } from '../../lib/run';

// At 16kHz, 16-bit mono PCM, 3,200 bytes represents 100ms of audio.
const chunkSize = 3200;
const bytesPerSecond = 32000;

run(async () => {
  // Generate a dictated note as raw PCM audio (16kHz, 16-bit, mono), one
  // sentence at a time:
  const sentences = [
    'Note to self: book a venue for the team offsite.',
    'Then ask Sam whether the second week of March works for everyone.',
  ];
  const clips = await Promise.all(
    sentences.map(async text => {
      const speech = await generateSpeech({
        model: xai.speech(),
        text,
        outputFormat: 'pcm',
        providerOptions: { xai: { sampleRate: 16000 } },
      });
      return speech.audio.uint8Array;
    }),
  );

  // The speaker holds a push-to-talk button, pauses to think between
  // sentences, and releases the button a moment after the last one:
  const pause = new Uint8Array(2 * bytesPerSecond);
  const bytes = Buffer.concat(clips.flatMap(clip => [clip, pause]));

  // Stream the audio in 100ms chunks, as a microphone would:
  let offset = 0;
  let buttonReleasedAt = 0;
  const audio = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (offset >= bytes.length) {
        buttonReleasedAt = Date.now();
        controller.close();
        return;
      }
      controller.enqueue(bytes.slice(offset, offset + chunkSize));
      offset += chunkSize;
      await delay(100);
    },
  });

  const result = streamTranscribe({
    model: google.transcription('gemini-3.5-transcribe-live'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    providerOptions: {
      google: {
        // The button press marks the speech: transcribe the whole recording
        // as one turn, without splitting it at pauses.
        streaming: { automaticActivityDetection: { disabled: true } },
      },
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'transcript-final') {
      console.log('final:', part.text);
    }
  }

  console.log('Text:', await result.text);
  console.log(
    `Transcript ready ${Date.now() - buttonReleasedAt}ms after the button was released`,
  );
  console.log('Warnings:', await result.warnings);
});
