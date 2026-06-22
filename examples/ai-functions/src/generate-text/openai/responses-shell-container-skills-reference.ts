import { openai } from '@ai-sdk/openai';
import { generateText } from 'ai';
import { run } from '../../lib/run';

/**
 * By registering a Skill in advance through the OpenAI Platform Skills management page (Storage > Skills),
 * you can obtain a `skill_id` that can be referenced when using it.
 * By specifying the registered `skill_id`,
 * https://platform.openai.com/storage/skills
 * the Skill becomes available within the container execution environment of the Responses API.
 *
 * In this example, `skills/use-ai-sdk/SKILL.md` from the AI SDK repository is registered as a Skill.
 * https://github.com/vercel/ai/blob/main/skills/use-ai-sdk/SKILL.md
 */

const skillId = 'skill_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx';

run(async () => {
  const result = await generateText({
    model: openai.responses('gpt-5.2'),
    tools: {
      shell: openai.tools.shell({
        environment: {
          type: 'containerAuto',
          skills: [
            {
              type: 'skillReference',
              providerReference: {
                openai: skillId,
              },
            },
          ],
        },
      }),
    },
    prompt: 'Summarize the information obtained from the skill `ai-sdk`',
  });

  console.log('Result:', result.text);
});
