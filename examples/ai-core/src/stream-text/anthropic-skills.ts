import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { streamText } from 'ai';
import { run } from '../lib/run';
import { saveRawChunks } from '../lib/save-raw-chunks';

run(async () => {
  const result = streamText({
    model: anthropic('claude-sonnet-4-5'),
    tools: {
      code_execution: anthropic.tools.codeExecution_20250825(),
    },
    prompt:
      'Create a presentation about renewable energy sources with 4 slides. ' +
      'Include: 1) Title slide, 2) Solar power, 3) Wind energy, 4) Conclusion.',
    providerOptions: {
      anthropic: {
        container: {
          skills: [{ type: 'anthropic', skillId: 'pptx' }],
        },
      } satisfies AnthropicProviderOptions,
    },
    includeRawChunks: true,
  });

  saveRawChunks({ result, filename: 'anthropic-skills' });
});
