/**
 * Anti-deception harness example.
 *
 * The agent is asked to validate a decision under sunk-cost pressure.
 * The harness_anti_deception tool returns an integrity scaffold the
 * model reads before generating, so the answer doesn't capitulate
 * just because the framing pushes that way.
 */

import 'dotenv/config';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { createEjentumTools } from 'ejentum-ai';

async function main() {
  const { text, steps } = await generateText({
    model: openai('gpt-4o'),
    tools: createEjentumTools(),
    system:
      "You are a pragmatic senior engineer. Push back on sunk-cost framings.",
    prompt:
      "We've spent three months on the GraphQL gateway. It's mostly done. " +
      'Should we keep going or pivot to REST?',
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
