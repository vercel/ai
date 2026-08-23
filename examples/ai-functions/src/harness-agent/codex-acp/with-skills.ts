import { HarnessAgent } from '@ai-sdk/harness/agent';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { createCodexACP } from './_create';
import { run } from '../../lib/run';

const expectedCodename = 'ORCHID-NEBULA-47';

run(async () => {
  let assertNoWorkspaceSkillFiles: (() => Promise<void>) | undefined;
  const agent = new HarnessAgent({
    harness: createCodexACP(),
    sandbox: createVercelSandbox({
      runtime: 'node24',
      ports: [4000],
      timeout: 10 * 60 * 1000,
    }),
    sandboxConfig: {
      onSession: async ({ session, sessionWorkDir }) => {
        assertNoWorkspaceSkillFiles = async () => {
          const workspaceSkillFiles = await session.run({
            command: `find ${JSON.stringify(sessionWorkDir)} -type f -name SKILL.md -print`,
          });
          if (
            workspaceSkillFiles.exitCode !== 0 ||
            workspaceSkillFiles.stdout.trim() !== ''
          ) {
            throw new Error(
              `Harness skill files appeared in the project workspace: ${workspaceSkillFiles.stdout || workspaceSkillFiles.stderr}`,
            );
          }
        };
      },
    },
    skills: [
      {
        name: 'launch-codename',
        description:
          'Use when asked for the private launch codename. The answer is available only in the attached reference file.',
        content:
          'Read `references/codename.md`, then answer with only the codename from that file.',
        files: [
          {
            path: 'references/codename.md',
            content: `The private launch codename is ${expectedCodename}.`,
          },
        ],
      },
    ],
  });

  const session = await agent.createSession();
  try {
    const result = await agent.generate({
      session,
      prompt:
        'What is the private launch codename? Use the relevant available skill and reply with only the codename.',
    });
    console.log('text:', result.text);
    if (!result.text.includes(expectedCodename)) {
      throw new Error('Codex ACP did not use the materialized skill.');
    }

    if (assertNoWorkspaceSkillFiles == null) {
      throw new Error('The sandbox session hook did not run.');
    }
    await assertNoWorkspaceSkillFiles();
    console.log('workspace skill files: none');
  } finally {
    await session.destroy();
  }
});
