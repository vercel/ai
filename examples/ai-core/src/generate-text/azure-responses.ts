import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import 'dotenv/config';

// Initialize Azure OpenAI provider
const azure = createAzure({
  apiKey: process.env.AZURE_API_KEY,
  baseURL: process.env.AZURE_BASE_URL,
});

async function main() {
  // Basic text generation
  const basicResult = await generateText({
    model: azure.responses('gpt-4o-mini'),
    prompt: 'What is quantum computing?',
  });

  console.log('\n=== Basic Text Generation ===');
  console.log(basicResult.text);
}

main().catch(console.error);
