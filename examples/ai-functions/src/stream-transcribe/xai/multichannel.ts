import { xai } from '@ai-sdk/xai';
import { experimental_streamTranscribe as streamTranscribe } from 'ai';
import { createAudioFileStream } from '../../lib/audio-file-stream';
import { printTranscriptionStream } from '../../lib/print-transcription-stream';
import { run } from '../../lib/run';

// xAI streaming STT can transcribe interleaved multichannel audio and emit a
// separate final transcript per channel. `channels` is required when
// `multichannel` is enabled. Each streamed part carries a `channelIndex` so you
// can attribute interim/final text to the correct channel (e.g. agent vs. caller
// on a phone call).
//
// Point this at a headerless 16kHz s16le capture with `channels` interleaved
// channels.
run(async () => {
  const channels = 2;

  const result = streamTranscribe({
    model: xai.transcription(),
    audio: createAudioFileStream({
      path: 'data/stereo-16k.pcm',
      chunkSize: 3200 * channels,
      realtime: true,
      bytesPerSecond: 32000 * channels,
    }),
    inputAudioFormat: { type: 'audio/pcm', rate: 16000 },
    providerOptions: {
      xai: {
        language: 'en',
        multichannel: true,
        channels,
        streaming: {
          interimResults: true,
          endpointing: 500,
        },
      },
    },
  });

  await printTranscriptionStream({ result });
});
