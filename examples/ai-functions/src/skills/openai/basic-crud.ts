import { openai } from '@ai-sdk/openai';
import {
  createSkill,
  listSkills,
  updateSkill,
  retrieveSkill,
  deleteSkill,
} from 'ai';
import { run } from '../../lib/run';

run(async () => {
  const { skill } = await createSkill({
    skillsManager: openai.skillsManager(),
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

    console.log('Waiting 15 seconds for skill to propagate...');
    await new Promise(resolve => setTimeout(resolve, 15000));

    const { skills } = await listSkills({
      skillsManager: openai.skillsManager(),
    });
    console.log('List:', skills);

    const { skill: updated } = await updateSkill({
      skillsManager: openai.skillsManager(),
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

    const { skill: retrieved } = await retrieveSkill({
      skillsManager: openai.skillsManager(),
      skillId: skill.id,
    });
    console.log('Retrieved:', retrieved);
  } finally {
    await deleteSkill({
      skillsManager: openai.skillsManager(),
      skillId: skill.id,
    });
    console.log('Deleted:', skill.id);
  }
});
