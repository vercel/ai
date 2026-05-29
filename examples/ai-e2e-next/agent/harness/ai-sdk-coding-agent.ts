import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { InferUITools, UIMessage } from 'ai';

export const aiSdkCodingHarnessAgent = new HarnessAgent({
  harness: claudeCode,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
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
    },
  }),
});

/*
 * Derived from `agent.tools` directly rather than `InferAgentUIMessage<typeof
 * agent>`. The latter extracts the tool set via `AGENT extends Agent<any,
 * infer TOOLS, any>`, which infers `string` for HarnessAgent because its
 * generate/stream parameters intersect `AgentCallParameters<...>` with the
 * required-`session` extension and that disrupts structural inference. Going
 * through the `tools` field side-steps the issue while preserving the same
 * concrete UIMessage shape.
 *
 * TODO: revert to `InferAgentUIMessage<typeof aiSdkCodingHarnessAgent>` once
 * `session` is supported natively as part of `AgentCallParameters`, so the
 * intersection in HarnessAgent's generate/stream parameters can be dropped.
 */
export type AiSdkCodingHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof aiSdkCodingHarnessAgent.tools>
>;
