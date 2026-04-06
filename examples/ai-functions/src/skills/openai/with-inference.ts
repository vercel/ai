import { openai } from '@ai-sdk/openai';
import { createSkill, generateText } from 'ai';
import { readFileSync } from 'fs';
import { run } from '../../lib/run';

run(async () => {
  const { skill } = await createSkill({
    skillsManager: openai.skillsManager(),
    files: [
      {
        path: 'island-rescue/SKILL.md',
        content: readFileSync('data/island-rescue/SKILL.md'),
      },
    ],
  });
  console.log('Created skill:', skill.id);

  const result = await generateText({
    model: openai.responses('gpt-5.2'),
    tools: {
      shell: openai.tools.shell({
        environment: {
          type: 'containerAuto',
          skills: [{ type: 'skillReference', skillId: skill.id }],
        },
      }),
    },
    prompt:
      'You are trapped and lost on a lonely island in 1895. Find a way to get rescued!',
  });

  console.log('Result:', result.text);
});
