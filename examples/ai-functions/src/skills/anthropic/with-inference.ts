import {
  anthropic,
  type AnthropicLanguageModelOptions,
} from '@ai-sdk/anthropic';
import { createSkill, generateText } from 'ai';
import { readFileSync } from 'fs';
import { run } from '../../lib/run';

run(async () => {
  const { skill } = await createSkill({
    skillsManager: anthropic.skillsManager(),
    files: [
      {
        path: 'island-rescue/SKILL.md',
        content: readFileSync('data/island-rescue/SKILL.md'),
      },
    ],
    displayTitle: 'Island Rescue',
  });
  console.log('Created skill:', skill.id);

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
          skills: [{ type: 'custom', skillId: skill.id }],
        },
      } satisfies AnthropicLanguageModelOptions,
    },
  });

  console.log('Result:', result.text);
});
