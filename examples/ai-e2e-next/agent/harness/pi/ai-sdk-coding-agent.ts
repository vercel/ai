import { HarnessAgent } from '@ai-sdk/harness/agent';
import { pi } from '@ai-sdk/harness-pi';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { InferUITools, UIMessage } from 'ai';

export const aiSdkCodingPiHarnessAgent = new HarnessAgent({
  harness: pi,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    setup: async ({ session, sessionWorkDir, abortSignal }) => {
      const result = await session.run({
        command: 'git clone --depth 1 https://github.com/vercel/ai.git .',
        workingDirectory: sessionWorkDir,
        abortSignal,
      });
      if (result.exitCode !== 0) {
        throw new Error(
          `Failed to clone vercel/ai (exit ${result.exitCode}): ${result.stderr}`,
        );
      }

      const installResult = await session.run({
        command: 'pnpm install',
        workingDirectory: sessionWorkDir,
        abortSignal,
      });
      if (installResult.exitCode !== 0) {
        throw new Error(
          `Failed to install dependencies (exit ${installResult.exitCode}): ${installResult.stderr}`,
        );
      }
    },
  }),
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
