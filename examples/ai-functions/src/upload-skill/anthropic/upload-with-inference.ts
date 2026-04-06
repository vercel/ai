import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { generateText, uploadSkill } from 'ai';
import { readFileSync } from 'fs';
import { run } from '../../lib/run';

run(async () => {
  const {
    providerReference,
    displayTitle,
    name,
    description,
    providerMetadata,
  } = await uploadSkill({
    api: anthropic.skills(),
    files: [
      {
        path: 'island-rescue/SKILL.md',
        content: readFileSync('data/island-rescue/SKILL.md'),
      },
    ],
    displayTitle: 'Island Rescue',
  });

  console.log('Provider reference:', providerReference);
  console.log('Display title:', displayTitle);
  console.log('Name:', name);
  console.log('Description:', description);
  console.log('Provider metadata:', providerMetadata);

  const result = await generateText({
    model: anthropic('claude-sonnet-4-5'),
    tools: {
      code_execution: anthropic.tools.codeExecution_20250825(),
    },
    prompt:
      'You are trapped and lost on a lonely island in 1895. Find a way to get rescued!',
    providerOptions: {
      anthropic: {
        container: {
          skills: [
            {
              type: 'custom',
              providerReference,
            },
          ],
        },
      } satisfies AnthropicLanguageModelOptions,
    },
  });

  console.log('Result:', result.text);
});
