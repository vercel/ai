import { elevenlabs } from '@ai-sdk/elevenlabs';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import 'dotenv/config';
import { saveAudioFile } from '../lib/save-audio';

async function main() {
  const result = await generateSpeech({
    model: elevenlabs.speech('eleven_turbo_v2_5'),
    text: 'This uses the Turbo model which balances quality and speed, supporting 32 languages.',
    language: 'en', // Can be any of the 32 supported languages
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);
  console.log('Model used: eleven_turbo_v2_5 (low latency, high quality)');

  await saveAudioFile(result.audio);
}

main().catch(console.error);
