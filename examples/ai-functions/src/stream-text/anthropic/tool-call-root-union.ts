import { anthropic } from '@ai-sdk/anthropic';
import { stepCountIs, streamText } from 'ai';
import { run } from '../../lib/run';
import { lookupUnionTool } from '../../tools/lookup-union-tool';

run(async () => {
  const result = streamText({
    model: anthropic('claude-sonnet-4-6'),
    tools: { lookup: lookupUnionTool },
    stopWhen: stepCountIs(2),
    prepareStep: ({ stepNumber }) => ({
      toolChoice: stepNumber === 0 ? 'required' : 'auto',
    }),
    maxOutputTokens: 256,
    includeRawChunks: true,
    prompt: 'Use lookup to fetch item 123, then tell me its title.',
  });

  for await (const part of result.fullStream) {
    if (part.type === 'tool-input-delta') {
      // Wrapped tools emit the original input once the arguments are complete.
      console.log('Tool input:', part.delta);
    } else if (part.type === 'text-delta') {
      process.stdout.write(part.text);
    } else if (part.type === 'error') {
      throw part.error;
    }
  }
  console.log();
  return result;
});
