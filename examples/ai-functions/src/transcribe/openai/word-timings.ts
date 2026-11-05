import { openai } from '@ai-sdk/openai';
import { transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: openai.transcription('whisper-1'),
    audio: await readFile('data/galileo.mp3'),
    timestampGranularities: ['word', 'segment'],
  });

  console.log('Text:', result.text);
  console.log('Words:', result.words);
  console.log('Segments:', result.segments);
  console.log('Warnings:', result.warnings);
});
