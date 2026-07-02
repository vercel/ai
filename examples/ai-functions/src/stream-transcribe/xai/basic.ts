import { xai } from '@ai-sdk/xai';
import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { createAudioFileStream } from '../../lib/audio-file-stream';
import { printTranscriptionStream } from '../../lib/print-transcription-stream';
import { run } from '../../lib/run';

// xAI uses the *same* `xai.transcription()` model for both batch (`transcribe`)
// and streaming (`experimental_streamTranscribe`). When streamed, the SDK opens
// a WebSocket to xAI's STT endpoint under the hood; streaming-specific behavior
// is tuned via `providerOptions.xai.streaming`.
//
// The audio must be raw PCM chunks that match `inputAudioFormat`. Point this at a
// headerless 16kHz signed-16-bit little-endian mono PCM capture. To create one
// from an mp3:
//
//   ffmpeg -i data/galileo.mp3 -f s16le -ac 1 -ar 16000 data/galileo-16k.pcm
run(async () => {
  const result = streamTranscribe({
    model: xai.transcription(),
    audio: createAudioFileStream({
      path: 'data/galileo-16k.pcm',
      // 100ms of 16kHz s16 mono audio per chunk.
      chunkSize: 3200,
      realtime: true,
      bytesPerSecond: 32000,
    }),
    inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    providerOptions: {
      xai: {
        language: 'en',
        keyterm: ['AI SDK', 'Grok', 'Galileo', 'Jupiter'],
        streaming: {
          interimResults: true,
          endpointing: 500,
        },
      },
    },
  });

  await printTranscriptionStream({ result });
});
