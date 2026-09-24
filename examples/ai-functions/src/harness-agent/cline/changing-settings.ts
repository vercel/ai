import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod/v4';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createCline } from './_create';

const profiles = {
  frontend: {
    instructionCode: 'FRONTEND_INSTRUCTION_17',
    policyCode: 'FRONTEND_POLICY_29',
    skillCode: 'FRONTEND_SKILL_41',
  },
  backend: {
    instructionCode: 'BACKEND_INSTRUCTION_53',
    policyCode: 'BACKEND_POLICY_67',
    skillCode: 'BACKEND_SKILL_83',
  },
} as const;

type Profile = keyof typeof profiles;

const cheaperModel = 'anthropic/claude-haiku-4-5';

const turns = [
  {
    label: 'default model',
    profile: 'frontend',
    useCheaperModel: false,
    prompt:
      'My name is Felix, by the way. Read the active workflow skill, call getPolicy, and include every validation code in your answer.',
  },
  {
    label: 'changed model',
    profile: 'frontend',
    useCheaperModel: true,
    prompt:
      'Remember my name? Include it in your answer. Read the active workflow skill, call getPolicy, and include every validation code in your answer.',
    remembersName: true,
  },
  {
    label: 'changed profile',
    profile: 'backend',
    useCheaperModel: true,
    prompt:
      'Read the active workflow skill, call getPolicy, and include every validation code in your answer.',
  },
] as const;

function createPolicyTool(profile: Profile) {
  return tool({
    description: 'Return the validation code for the active project policy.',
    inputSchema: z.object({}),
    execute: async () => ({ code: profiles[profile].policyCode }),
  });
}

run(async () => {
  const sandbox = createVercelSandbox({
    runtime: 'node24',
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: createCline(),
    sandbox,
    tools: { getPolicy: createPolicyTool('frontend') },
    callOptionsSchema: z.object({
      profile: z.enum(['frontend', 'backend']),
      useCheaperModel: z.boolean(),
    }),
    prepareCall: ({ options, ...call }) => {
      const profile = profiles[options.profile];
      return {
        ...call,
        model: options.useCheaperModel ? cheaperModel : undefined,
        instructions: `Include ${profile.instructionCode} in the answer.`,
        skills: [
          {
            name: `${options.profile}-workflow`,
            description: `Use for the current ${options.profile} validation request.`,
            content: `The active skill validation code is ${profile.skillCode}. Include it in the answer.`,
          },
        ],
        tools: { getPolicy: createPolicyTool(options.profile) },
      };
    },
  });

  const session = await agent.createSession();
  try {
    for (const turn of turns) {
      console.log(`--- ${turn.label} turn ---`);
      const result = await agent.stream({
        session,
        prompt: turn.prompt,
        options: {
          profile: turn.profile,
          useCheaperModel: turn.useCheaperModel,
        },
      });
      let text = '';
      await printFullStream({
        result,
        onText: part => {
          text += part.text;
        },
      });

      for (const code of Object.values(profiles[turn.profile])) {
        if (!text.includes(code)) {
          throw new Error(
            `${turn.label} turn did not use its prepared settings: missing ${code}`,
          );
        }
      }
      if ('remembersName' in turn && !text.includes('Felix')) {
        throw new Error(
          'The second turn did not retain the name from the first turn.',
        );
      }
    }
  } finally {
    await session.destroy();
  }
});
