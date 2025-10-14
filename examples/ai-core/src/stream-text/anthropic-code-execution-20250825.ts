import { anthropic } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { run } from '../lib/run';
import { saveRawChunks } from '../lib/save-raw-chunks';

run(async () => {
  const result = streamText({
    model: anthropic('claude-sonnet-4-5'),
    prompt:
      'Write a Python script to calculate fibonacci number' +
      ' and then execute it to find the 10th fibonacci number',
    tools: {
      code_execution: anthropic.tools.codeExecution_20250825(),
    },
    includeRawChunks: true,
  });

  await saveRawChunks({
    result,
    filename: 'anthropic-code-execution-20250825',
  });
});
