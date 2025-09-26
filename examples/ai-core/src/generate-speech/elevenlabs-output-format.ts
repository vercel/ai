import { elevenlabs } from '@ai-sdk/elevenlabs';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import 'dotenv/config';
import { saveAudioFile } from '../lib/save-audio';

async function main() {
  const result = await generateSpeech({
    model: elevenlabs.speech('eleven_multilingual_v2'),
    text: 'This audio is generated in high-quality MP3 format.',
    outputFormat: 'mp3_44100_192', // High-quality MP3 at 192kbps
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);
  console.log('Output format: MP3 at 44.1kHz, 192kbps');

  await saveAudioFile(result.audio);
}

main().catch(console.error);
