import { createAzure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import 'dotenv/config';

// Initialize Azure OpenAI provider
const azure = createAzure({
  resourceName: process.env.AZURE_RESOURCE_NAME,
  apiKey: process.env.AZURE_API_KEY,
});

async function main() {
  // Basic text generation
  const basicResult = await generateText({
    model: azure.responses('gpt-4.1-mini'),
    prompt: 'What is quantum computing?',
  });

  console.log('\n=== Basic Text Generation ===');
  console.log(basicResult.text);
}

main().catch(console.error);
