import { streamText, gateway, stepCountIs } from 'ai';
import 'dotenv/config';

async function main() {
  const result = streamText({
    model: 'openai/gpt-5',
    prompt: 'What is the latest news about TypeScript? Search the web.',
    tools: {
      perplexity_search: gateway.tools.perplexitySearch({
        maxResults: 3,
      }),
    },
    providerOptions: {
      openai: {
        store: true,
      },
    },
    stopWhen: stepCountIs(5),
  });

  for await (const part of result.fullStream) {
    if (part.type === 'tool-call') {
      console.log('[TOOL-CALL]');
      console.log('  toolName:', part.toolName);
      console.log('  toolCallId:', part.toolCallId);
      console.log('  providerExecuted:', part.providerExecuted);
      console.log('  input:', part.input);
    }

    if (part.type === 'tool-result') {
      console.log('[TOOL-RESULT]');
      console.log('  toolName:', part.toolName);
      console.log('  toolCallId:', part.toolCallId);
      console.log('  providerExecuted:', part.providerExecuted);
      console.log('  input:', part.input);
      console.log('  output:', part.output ? '[HAS DATA]' : undefined);
    }

    if (part.type === 'finish-step') {
      console.log('[FINISH-STEP] finishReason:', part.finishReason);
    }

    if (part.type === 'finish') {
      console.log('[FINISH] finishReason:', part.finishReason);
    }

    if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    }
  }

  const steps = await result.steps;
  const text = await result.text;
  const usage = await result.usage;

  console.log();
  console.log('--- Final Result ---');
  console.log('steps.length:', steps?.length);
  console.log('text.length:', text?.length);
  console.log('Token usage:', usage);
}

main().catch(console.error);
