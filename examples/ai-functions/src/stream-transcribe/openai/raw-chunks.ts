import { openai } from '@ai-sdk/openai';
import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { createAudioFileStream } from '../../lib/audio-file-stream';
import { run } from '../../lib/run';

// Same as basic.ts, but with `includeRawChunks` enabled so you can inspect the
// underlying OpenAI realtime transcription events as they arrive over the
// WebSocket. Useful when debugging provider behavior.
run(async () => {
  const result = streamTranscribe({
    model: openai.transcription('gpt-realtime-whisper'),
    audio: createAudioFileStream({
      path: 'data/galileo.pcm',
      chunkSize: 4800,
      realtime: true,
      bytesPerSecond: 48000,
    }),
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    includeRawChunks: true,
    providerOptions: {
      openai: {
        language: 'en',
        streaming: { delay: 'low' },
      },
    },
  });

  for await (const part of result.fullStream) {
    if (part.type === 'raw') {
      console.log('raw:', JSON.stringify(part.rawValue));
    } else if (part.type === 'transcript-delta') {
      process.stdout.write(part.delta);
    }
  }

  console.log('\n\nFinal:', await result.text);
});
