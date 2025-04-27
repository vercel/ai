import { lmnt } from '@ai-sdk/lmnt';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import 'dotenv/config';
import { saveAudioFile } from '../lib/save-audio';

async function main() {
  const result = await generateSpeech({
    model: lmnt.speech('aurora'),
    text: 'Hello from the AI SDK!',
    speed: 1.5,
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);

  await saveAudioFile(result.audio);
}

main().catch(console.error);
