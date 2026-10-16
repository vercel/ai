import { azure } from '@ai-sdk/azure';
import { generateText } from 'ai';
import { run } from '../../lib/run';

run(async () => {
  // Set AZURE_DEPLOYMENT_ID to your deployment of AZURE_MODEL_ID.
  const model = azure(process.env.AZURE_DEPLOYMENT_ID ?? 'gpt-4.1-mini', {
    modelId: process.env.AZURE_MODEL_ID ?? 'gpt-4.1-mini',
  });
  const result = await generateText({
    model,
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log('Reported model ID:', model.modelId);
  console.log('Response model ID:', result.response.modelId);
  console.log(result.text);
  console.log('Usage:', result.usage);
});
