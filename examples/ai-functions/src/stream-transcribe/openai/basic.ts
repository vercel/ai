import { openai } from '@ai-sdk/openai';
import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { createAudioFileStream } from '../../lib/audio-file-stream';
import { printTranscriptionStream } from '../../lib/print-transcription-stream';
import { run } from '../../lib/run';

// OpenAI exposes `gpt-realtime-whisper` as a dedicated *streaming* transcription
// model. It only supports `doStream` (not `doGenerate`), so it must be used with
// `experimental_streamTranscribe` rather than `transcribe`.
//
// The audio must be raw PCM chunks that match `inputAudioFormat`. Point this at a
// headerless 24kHz signed-16-bit little-endian mono PCM capture. To create one
// from an mp3:
//
//   ffmpeg -i data/galileo.mp3 -f s16le -ac 1 -ar 24000 data/galileo.pcm
run(async () => {
  const result = streamTranscribe({
    model: openai.transcription('gpt-realtime-whisper'),
    audio: createAudioFileStream({
      path: 'data/galileo.pcm',
      // 100ms of 24kHz s16 mono audio per chunk.
      chunkSize: 4800,
      realtime: true,
      bytesPerSecond: 48000,
    }),
    inputAudioFormat: { type: 'audio/pcm', rate: 24000 },
    providerOptions: {
      openai: {
        language: 'en',
        streaming: {
          delay: 'low',
        },
      },
    },
  });

  await printTranscriptionStream({ result });
});
