import { elevenLabs } from '@ai-sdk/elevenlabs';
import { transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { run } from '../../lib/run';

run(async () => {
  const result = await transcribe({
    model: elevenLabs.transcription('scribe_v3'),
    audio: await readFile('data/galileo.mp3'),
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.language);
  console.log('Segments:', result.segments);
  console.log(
    'Language probability:',
    result.providerMetadata.elevenlabs?.languageProbability,
  );
  console.log(
    'Transcription ID:',
    result.providerMetadata.elevenlabs?.transcriptionId,
  );
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
});
