import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';

run(async () => {
  // Set AZURE_DEPLOYMENT_ID to your deployment of AZURE_MODEL_ID.
  const model = azure(process.env.AZURE_DEPLOYMENT_ID ?? 'gpt-4.1-mini', {
    modelId: process.env.AZURE_MODEL_ID ?? 'gpt-4.1-mini',
  });
  const result = streamText({
    model,
    prompt: 'Invent a new holiday and describe its traditions.',
  });

  console.log('Reported model ID:', model.modelId);
  await printFullStream({ result });
  console.log('Response model ID:', (await result.response).modelId);
});
