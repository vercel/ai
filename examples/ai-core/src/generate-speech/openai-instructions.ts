import { openai } from '@ai-sdk/openai';
import { experimental_generateSpeech as generateSpeech } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await generateSpeech({
    model: openai.speech('tts-1'),
    text: 'Hello from the AI SDK!',
    instructions: 'Speak in a slow and steady tone',
  });

  console.log('Audio:', result.audio);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);
}

main().catch(console.error);
