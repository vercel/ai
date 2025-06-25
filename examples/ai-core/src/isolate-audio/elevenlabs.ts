import { elevenlabs } from '@ai-sdk/elevenlabs';
import { experimental_isolateAudio as isolateAudio } from 'ai';
import 'dotenv/config';
import { saveAudioFile } from '../lib/save-audio';
import { readFile } from 'fs/promises';

async function main() {
  const result = await isolateAudio({
    model: elevenlabs.isolation(),
    audio: await readFile('data/noise.mp3'),
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
}

main().catch(console.error);
