/**
 * Streaming harness example.
 *
 * Demonstrates `streamText` with the four Ejentum tools. The model
 * picks a harness, runs the tool, then streams its user-facing answer.
 */

import 'dotenv/config';
import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createEjentumTools } from 'ejentum-ai';

async function main() {
  const result = streamText({
    model: openai('gpt-4o'),
    tools: createEjentumTools(),
    prompt:
      'Refactor a hot path in our request handler from O(n^2) to O(n log n). ' +
      'Walk me through the failure modes I should guard against during the change.',
    maxSteps: 5,
  });

  console.log('--- Streamed answer ---');
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
  process.stdout.write('\n');

  const stepsArray = await result.steps;
  console.log('\n--- Tool calls made along the way ---');
  for (const step of stepsArray) {
    for (const call of step.toolCalls ?? []) {
      console.log(`-> ${call.toolName}({ query: "${call.args.query}" })`);
    }
  }
}

main().catch(console.error);
