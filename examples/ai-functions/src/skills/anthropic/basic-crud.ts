import { anthropic } from '@ai-sdk/anthropic';
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
    provider: anthropic,
    files: [
      {
        path: 'greeting/SKILL.md',
        content: new TextEncoder().encode(
          '---\nname: greeting\ndescription: A greeting skill\n---\n\n# Greeting\nHello, world!',
        ),
      },
    ],
    displayTitle: 'Greeting Skill',
  });

  try {
    console.log('Created:', skill);

    const { skills } = await experimental_listSkills({ provider: anthropic });
    console.log('List:', skills);

    const { skill: updated } = await experimental_updateSkill({
      provider: anthropic,
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
      provider: anthropic,
      skillId: skill.id,
    });
    console.log('Retrieved:', retrieved);
  } finally {
    await experimental_deleteSkill({
      provider: anthropic,
      skillId: skill.id,
    });
    console.log('Deleted:', skill.id);
  }
});
