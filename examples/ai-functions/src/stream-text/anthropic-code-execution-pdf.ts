import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { streamText, stepCountIs } from 'ai';
import { run } from '../lib/run';
import { saveRawChunks } from '../lib/save-raw-chunks';

run(async () => {
  const result = streamText({
    model: anthropic('claude-sonnet-4-5'),
    prompt: 'Create a simple PDF document with my name Aayush on it',
    tools: {
      code_execution: anthropic.tools.codeExecution_20250825(),
    },
    providerOptions: {
      anthropic: {
        container: {
          skills: [{ type: 'anthropic', skillId: 'pdf' }],
        },
      } satisfies AnthropicProviderOptions as any,
    },
    includeRawChunks: true,
    stopWhen: stepCountIs(25),
  });

  await saveRawChunks({
    result,
    filename: 'anthropic-code-execution-pdf-skill',
  });
});
