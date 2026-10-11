import {
  deepgram,
  type DeepgramTranscriptionModelOptions,
} from '@ai-sdk/deepgram';
import { transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: deepgram.transcription('nova-3'),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      deepgram: {
        keyterm: ['Galileo', 'Jupiter'],
      } satisfies DeepgramTranscriptionModelOptions,
    },
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
});
