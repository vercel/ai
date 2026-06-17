import { HarnessAgent } from '@ai-sdk/harness/agent';
import { pi } from '@ai-sdk/harness-pi';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { InferUITools, UIMessage } from 'ai';

// Default sandbox resources won't allow for a full parallel build of all packages.
// Not worth bumping all demo sandboxes' resources for just this, we can easily
// work around this by guiding the harness.
const instructions = `
Building all packages at once (e.g. running \`pnpm build\` or \`pnpm build:packages\`)
will exceed sandbox memory. When asked to do this, use the corresponding
\`pnpm exec turbo\` call directly with a lower \`--concurrency=4\` flag.
`;

export const aiSdkCodingPiHarnessAgent = new HarnessAgent({
  harness: pi,
  instructions,
  sandbox: createVercelSandbox({
    runtime: 'node24',
  }),
  onSandboxSession: async ({ session, sessionWorkDir, abortSignal }) => {
    const result = await session.run({
      command:
        'test -d .git || git clone --depth 1 https://github.com/vercel/ai.git .',
      workingDirectory: sessionWorkDir,
      abortSignal,
    });
    if (result.exitCode !== 0) {
      throw new Error(
        `Failed to clone vercel/ai (exit ${result.exitCode}): ${result.stderr}`,
      );
    }

    const installResult = await session.run({
      command: 'test -d node_modules || pnpm install',
      workingDirectory: sessionWorkDir,
      abortSignal,
    });
    if (installResult.exitCode !== 0) {
      throw new Error(
        `Failed to install dependencies (exit ${installResult.exitCode}): ${installResult.stderr}`,
      );
    }
  },
});

/*
 * See `basic-agent.ts` for the rationale behind deriving the UIMessage type
 * from `agent.tools` instead of `InferAgentUIMessage<typeof agent>`.
 */
export type AiSdkCodingPiHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof aiSdkCodingPiHarnessAgent.tools>
>;
