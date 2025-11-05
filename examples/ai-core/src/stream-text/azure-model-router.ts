import { azure } from '@ai-sdk/azure';
import { streamText } from 'ai';
import { run } from '../lib/run';

run(async function main() {
  const result = streamText({
    model: azure.completion('model-router'),
    prompt: 'Say where is copenhagen in three words max',
    includeRawChunks: true,
  });

  for await (const chunk of result.fullStream) {
    console.log(`[CHUNK ${chunk.type}]`, chunk);
  }

  const response = await result.response;
  console.log('--- final response ---');
  console.log('modelId:', response.modelId);
  console.log('response headers:', response.headers);
})