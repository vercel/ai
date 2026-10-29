import { elevenLabs } from '@ai-sdk/elevenlabs';
import { transcribe } from 'ai';
import { readFile } from 'node:fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: elevenLabs.transcription('scribe_v2'),
    audio: await readFile('data/galileo.mp3'),
    providerOptions: {
      elevenlabs: { timestampsGranularity: 'character' },
    },
  });

  console.log('Word segments:', result.segments);
  console.log(
    'Word and character timestamps:',
    result.providerMetadata?.elevenlabs?.words,
  );
});
