// @ts-nocheck
import { generateText, streamText, generateObject } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';

const provider = createOpenAI();

// Reading telemetry data
async function handleResponse() {
  const result = await generateText({
    model: provider('gpt-4'),
    prompt: 'Hello'
  });

  // Direct property access
  console.log('Finish reason:', result.telemetry?.attributes['ai.response.finishReason']);
  console.log('Generated text:', result.telemetry?.attributes['ai.response.text']);
  console.log('Tool calls:', result.telemetry?.attributes['ai.response.toolCalls']);

  // Object destructuring
  const {
    'ai.response.msToFirstChunk': latency,
    'ai.response.object': resultObj
  } = result.telemetry?.attributes ?? {};

  if (latency > 1000) {
    console.warn('High latency detected');
  }

  // Accessing all paths
  const metrics = {
    finish: result.telemetry?.attributes['ai.response.finishReason'],
    text: result.telemetry?.attributes['ai.response.text'],
    tools: result.telemetry?.attributes['ai.response.toolCalls'],
    latency: result.telemetry?.attributes['ai.response.msToFirstChunk'],
    object: result.telemetry?.attributes['ai.response.object']
  };
}
