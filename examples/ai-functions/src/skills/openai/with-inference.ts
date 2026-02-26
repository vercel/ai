import { openai } from '@ai-sdk/openai';
import {
  experimental_createSkill,
  experimental_deleteSkill,
  generateText,
} from 'ai';
import { readFileSync } from 'fs';
import { run } from '../../lib/run';

run(async () => {
  const { skill } = await experimental_createSkill({
    provider: openai,
    files: [
      {
        path: 'island-rescue/SKILL.md',
        content: readFileSync('data/island-rescue/SKILL.md'),
      },
    ],
  });
  console.log('Created skill:', skill.id);

  try {
    const result = await generateText({
      model: openai.responses('gpt-5.2'),
      tools: {
        shell: openai.tools.shell({
          environment: {
            type: 'containerAuto',
            skills: [
              { type: 'skillReference', skillId: skill.id, version: '1' },
            ],
          },
        }),
      },
      prompt:
        'You are trapped and lost on a lonely island in 1895. Find a way to get rescued!',
    });

    console.log('Result:', result.text);
  } finally {
    await experimental_deleteSkill({
      provider: openai,
      skillId: skill.id,
    });
    console.log('Deleted skill:', skill.id);
  }
});
