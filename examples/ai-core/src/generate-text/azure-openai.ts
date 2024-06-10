import { createAzureOpenAI } from '@ai-sdk/azure-openai';
import { generateText } from 'ai';
import dotenv from 'dotenv';

dotenv.config();

const azureOpenAI = createAzureOpenAI({
  apiKey: process.env.AZURE_OPENAI_API_KEY,
  resourceName: process.env.AZURE_OPENAI_RESOURCE_NAME,
});

async function main() {
  const result = await generateText({
    model: azureOpenAI('gpt-3.5-turbo'),
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log(result.text);
}

main().catch(console.error);
