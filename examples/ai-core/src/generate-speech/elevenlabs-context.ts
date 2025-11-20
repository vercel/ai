import { elevenlabs } from '@ai-sdk/elevenlabs';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import 'dotenv/config';
import { saveAudioFile } from '../lib/save-audio';

async function main() {
  const result = await generateSpeech({
    model: elevenlabs.speech('eleven_multilingual_v2'),
    text: 'This sentence uses context for better prosody.',
    providerOptions: {
      elevenlabs: {
        previous_text: 'The previous sentence ended with a question mark?',
        next_text: 'The next sentence will continue the story.',
        seed: 42, // For reproducible generation
      },
    },
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);
  console.log('Used context for improved prosody and consistency');

  await saveAudioFile(result.audio);
}

main().catch(console.error);
