/**
 * Reasoning harness example.
 *
 * The agent calls `harness_reasoning` before producing its user-facing
 * answer to a diagnostic question. The returned scaffold contains a
 * named failure pattern, an executable procedure, a reasoning topology
 * (graph DAG), and a falsification test the model reads internally
 * before generating.
 */

import 'dotenv/config';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createEjentumTools } from 'ejentum-ai';

async function main() {
  const { text, steps } = await generateText({
    model: openai('gpt-4o'),
    tools: createEjentumTools(),
    prompt:
      'Our nightly ETL job has started failing intermittently over ' +
      'the past two weeks. Nothing in the code or schema has changed. ' +
      'Diagnose where to look first.',
    maxSteps: 5,
  });

  console.log('--- Tool calls ---');
  for (const step of steps) {
    for (const call of step.toolCalls ?? []) {
      console.log(`-> ${call.toolName}({ query: "${call.args.query}" })`);
    }
  }

  console.log('\n--- Final answer ---');
  console.log(text);
}

main().catch(console.error);
