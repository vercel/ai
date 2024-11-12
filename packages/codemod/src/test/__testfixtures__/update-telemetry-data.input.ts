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
  console.log('Finish reason:', result.telemetry?.attributes['ai.finishReason']);
  console.log('Generated text:', result.telemetry?.attributes['ai.result.text']);
  console.log('Tool calls:', result.telemetry?.attributes['ai.result.toolCalls']);

  // Object destructuring
  const {
    'ai.stream.msToFirstChunk': latency,
    'ai.result.object': resultObj
  } = result.telemetry?.attributes ?? {};

  if (latency > 1000) {
    console.warn('High latency detected');
  }

  // Accessing all paths
  const metrics = {
    finish: result.telemetry?.attributes['ai.finishReason'],
    text: result.telemetry?.attributes['ai.result.text'],
    tools: result.telemetry?.attributes['ai.result.toolCalls'],
    latency: result.telemetry?.attributes['ai.stream.msToFirstChunk'],
    object: result.telemetry?.attributes['ai.result.object']
  };
}
