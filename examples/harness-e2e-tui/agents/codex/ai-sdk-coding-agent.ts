import { HarnessAgent } from '@ai-sdk/harness/agent';
import { codex } from '@ai-sdk/harness-codex';
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

export const aiSdkCodingCodexHarnessAgent = new HarnessAgent({
  harness: codex,
  instructions,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
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
 * Derived from `agent.tools` directly rather than `InferAgentUIMessage<typeof
 * agent>`. The latter extracts the tool set via `AGENT extends Agent<any,
 * infer TOOLS, any>`, which infers `string` for HarnessAgent because its
 * generate/stream parameters intersect `AgentCallParameters<...>` with the
 * required-`session` extension and that disrupts structural inference. Going
 * through the `tools` field side-steps the issue while preserving the same
 * concrete UIMessage shape.
 *
 * TODO: revert to `InferAgentUIMessage<typeof aiSdkCodingCodexHarnessAgent>`
 * once `session` is supported natively as part of `AgentCallParameters`, so
 * the intersection in HarnessAgent's generate/stream parameters can be
 * dropped.
 */
export type AiSdkCodingCodexHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof aiSdkCodingCodexHarnessAgent.tools>
>;
