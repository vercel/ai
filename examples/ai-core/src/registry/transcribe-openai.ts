import { experimental_transcribe as transcribe } from 'ai';
import { readFile } from 'fs/promises';
import { registry } from './setup-registry';

async function main() {
  const result = await transcribe({
    model: registry.transcriptionModel('openai:whisper-1'),
    audio: await readFile('../data/galileo.mp3'),
  });

  console.log('Transcript:', result.text);
  console.log('Language:', result.language);
  console.log('Duration:', result.durationInSeconds);
  console.log('Segments:', result.segments);
}

main().catch(console.error);
