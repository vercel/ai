import { openai } from '@ai-sdk/openai';
import { experimental_speak as speak } from 'ai';
import 'dotenv/config';

async function main() {
  const result = await speak({
    model: openai.speech('tts-1'),
    text: 'Hello from the Vercel AI SDK!',
    providerOptions: {
      openai: {
        voice: 'nova',
        speed: 1.5,
      },
    },
  });

  console.log('Audio:', result.audioData);
  console.log('Content Type:', result.contentType);
  console.log('Warnings:', result.warnings);
  console.log('Responses:', result.responses);
  console.log('Provider Metadata:', result.providerMetadata);
}

main().catch(console.error);
