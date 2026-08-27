import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { tool } from 'ai';
import { z } from 'zod/v4';
import { printFullStream } from '../../lib/print-full-stream';
import { run } from '../../lib/run';
import { createDeepAgents } from './_create';

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
    ports: [4000],
    timeout: 10 * 60 * 1000,
  });
  const agent = new HarnessAgent({
    harness: createDeepAgents(),
    sandbox,
    tools: { getPolicy: createPolicyTool('frontend') },
    callOptionsSchema: z.object({
      profile: z.enum(['frontend', 'backend']),
    }),
    prepareCall: ({ options, ...call }) => {
      const profile = profiles[options.profile];
      return {
        ...call,
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
    for (const profileName of ['frontend', 'backend'] as const) {
      console.log(`--- ${profileName} turn ---`);
      const result = await agent.stream({
        session,
        prompt:
          'Read the active workflow skill, call getPolicy, and include every validation code in your answer.',
        options: { profile: profileName },
      });
      let text = '';
      await printFullStream({
        result,
        onText: part => {
          text += part.text;
        },
      });

      for (const code of Object.values(profiles[profileName])) {
        if (!text.includes(code)) {
          throw new Error(
            `${profileName} turn did not use its prepared settings: missing ${code}`,
          );
        }
      }
    }
  } finally {
    await session.destroy();
  }
});
