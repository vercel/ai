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
    skillsManager: anthropic.skillsManager(),
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

    const { skills } = await experimental_listSkills({
      skillsManager: anthropic.skillsManager(),
    });
    console.log('List:', skills);

    const { skill: updated } = await experimental_updateSkill({
      skillsManager: anthropic.skillsManager(),
      skillId: skill.id,
      files: [
        {
          path: 'greeting/SKILL.md',
          content: btoa(
            '---\nname: greeting\ndescription: An updated greeting skill\n---\n\n# Greeting\nHello, updated world!',
          ),
        },
      ],
    });
    console.log('Updated:', updated);

    const { skill: retrieved } = await experimental_retrieveSkill({
      skillsManager: anthropic.skillsManager(),
      skillId: skill.id,
    });
    console.log('Retrieved:', retrieved);
  } finally {
    await experimental_deleteSkill({
      skillsManager: anthropic.skillsManager(),
      skillId: skill.id,
    });
    console.log('Deleted:', skill.id);
  }
});
