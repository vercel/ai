import { openai } from '@ai-sdk/openai';
import {
  experimental_createSkill,
  experimental_listSkills,
  experimental_updateSkill,
  experimental_retrieveSkill,
  experimental_deleteSkill,
} from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { skill } = await experimental_createSkill({
    provider: openai,
    files: [
      {
        path: 'greeting/SKILL.md',
        content: new TextEncoder().encode(
          '---\nname: greeting\ndescription: A greeting skill\n---\n\n# Greeting\nHello, world!',
        ),
      },
    ],
  });

  try {
    console.log('Created:', skill);

    const { skills } = await experimental_listSkills({ provider: openai });
    console.log('List:', skills);

    const { skill: updated } = await experimental_updateSkill({
      provider: openai,
      skillId: skill.id,
      files: [
        {
          path: 'greeting/SKILL.md',
          content: new TextEncoder().encode(
            '---\nname: greeting\ndescription: An updated greeting skill\n---\n\n# Greeting\nHello, updated world!',
          ),
        },
      ],
    });
    console.log('Updated:', updated);

    const { skill: retrieved } = await experimental_retrieveSkill({
      provider: openai,
      skillId: skill.id,
    });
    console.log('Retrieved:', retrieved);
  } finally {
    await experimental_deleteSkill({
      provider: openai,
      skillId: skill.id,
    });
    console.log('Deleted:', skill.id);
  }
});
