import { xai, type XaiTranscriptionModelOptions } from '@ai-sdk/xai';
import { transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: xai.transcription(),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      xai: {
        vadThreshold: 0.3,
      } satisfies XaiTranscriptionModelOptions,
    },
  });

  console.log('Text:', result.text);
  console.log('Segments:', result.segments);
  console.log('Warnings:', result.warnings);
});
