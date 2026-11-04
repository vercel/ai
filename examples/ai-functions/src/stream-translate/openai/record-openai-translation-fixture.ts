import { openai } from '@ai-sdk/openai';
import {
  experimental_streamTranslate as streamTranslate,
  generateSpeech,
} from 'ai';
import { run } from '../../lib/run';
import { createPacedAudioStream } from '../create-paced-audio-stream';

run(async () => {
  const speech = await generateSpeech({
    model: openai.speech('tts-1'),
    text: 'The quick brown fox jumps over the lazy dog.',
    outputFormat: 'pcm',
  });

  const audio = createPacedAudioStream({
    bytes: speech.audio.uint8Array,
    sampleRate: 24000,
    chunkDurationMs: 200,
  });

  return streamTranslate({
    model: openai.translation('gpt-realtime-translate'),
    audio,
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    targetLanguage: 'es',
    includeRawChunks: true,
    abortSignal: AbortSignal.timeout(60_000),
  });
});
