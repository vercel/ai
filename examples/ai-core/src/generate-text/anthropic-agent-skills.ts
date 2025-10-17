import { anthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { run } from '../lib/run';

run(async () => {
  const result = await generateText({
    model: anthropic('claude-sonnet-4-5-20250929'),
    tools: {
      code_execution: anthropic.tools.codeExecution_20250825(),
    },
    prompt:
      'Create a presentation about renewable energy sources with 5 slides. ' +
      'Include: 1) Title slide, 2) Solar power, 3) Wind energy, 4) Hydroelectric power, 5) Conclusion.',
    providerOptions: {
      anthropic: {
        skills: [{ type: 'anthropic', skill_id: 'pptx' }],
        betas: [
          'code-execution-2025-08-25',
          'skills-2025-10-02',
          'files-api-2025-04-14',
        ],
      },
    },
  });

  console.dir(result.content, { depth: Infinity });
});
