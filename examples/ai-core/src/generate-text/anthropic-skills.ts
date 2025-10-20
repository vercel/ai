import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../lib/run';
import { print } from '../lib/print';

run(async () => {
  const result = await generateText({
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
  });

  print('content', result.content);

  console.log(JSON.stringify(result.response.body));
});
