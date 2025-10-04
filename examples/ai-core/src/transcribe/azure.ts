import { azure } from '@ai-sdk/azure';
import { experimental_transcribe as transcribe } from 'ai';
import 'dotenv/config';
import { readFile } from 'fs/promises';

/**
 *
 * *** NOTICE ***
 * It has been reported that transcribe does not work as expected with the default version.
 * If you want to use a working version, try the source code below.
 *
 * ai\examples\ai-core\src\transcribe\azure-deployment-based.ts
 *
 */

async function main() {
  const result = await transcribe({
    model: azure.transcription('whisper-1'), // use your own deployment
    audio: await readFile('data/galileo.mp3'),
  });

  console.log('Text:', result.text);
  console.log('Duration:', result.durationInSeconds);
  console.log('Language:', result.language);
  console.log('Segments:', result.segments);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
}

main().catch(console.error);
