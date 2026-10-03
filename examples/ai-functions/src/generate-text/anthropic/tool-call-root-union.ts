import { anthropic } from '@ai-sdk/anthropic';
import { generateText, stepCountIs } from 'ai';
import { run } from '../../lib/run';
import { lookupUnionTool } from '../../tools/lookup-union-tool';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-4-6'),
    tools: { lookup: lookupUnionTool },
    stopWhen: stepCountIs(2),
    prepareStep: ({ stepNumber }) => ({
      toolChoice: stepNumber === 0 ? 'required' : 'auto',
    }),
    maxOutputTokens: 256,
    include: { responseBody: true },
    prompt: 'Use lookup to fetch item 123, then tell me its title.',
  });

  console.log(result.text);
  return result;
});
