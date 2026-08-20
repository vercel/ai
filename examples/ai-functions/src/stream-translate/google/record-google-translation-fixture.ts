import { google } from '@ai-sdk/google';
import {
  experimental_streamTranslate as streamTranslate,
  generateSpeech,
} from 'ai';
import { run } from '../../lib/run';
import { createPacedAudioStream } from '../create-paced-audio-stream';
import { resamplePcm16Mono } from './resample-pcm16-mono';

run(async () => {
  const speech = await generateSpeech({
    model: google.speech('gemini-2.5-flash-preview-tts'),
    text: 'The quick brown fox jumps over the lazy dog.',
    outputFormat: 'pcm',
  });

  const bytes = resamplePcm16Mono(speech.audio.uint8Array, 24000, 16000);
  const audio = createPacedAudioStream({
    bytes,
    sampleRate: 16000,
    chunkDurationMs: 100,
  });

  return streamTranslate({
    model: google.translation('gemini-3.5-live-translate-preview'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    targetLanguage: 'es',
    includeRawChunks: true,
    abortSignal: AbortSignal.timeout(60_000),
  });
});
