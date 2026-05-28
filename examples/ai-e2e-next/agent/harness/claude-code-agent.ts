import { HarnessAgent } from '@ai-sdk/harness/agent';
import { claudeCode } from '@ai-sdk/harness-claude-code';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { InferAgentUIMessage } from 'ai';

/*
 * Module-level agent definition. The constructor only stores config — no
 * network calls, no sandbox creation. Per-request data (sessionId,
 * resumeFrom, prompt) lives on the `stream`/`generate` calls in the API
 * route, so a single agent instance can host many concurrent sessions.
 */
export const claudeCodeHarnessAgent = new HarnessAgent({
  harness: claudeCode,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
    timeout: 10 * 60 * 1000,
  }),
});

export type ClaudeCodeHarnessAgentMessage = InferAgentUIMessage<
  typeof claudeCodeHarnessAgent
>;
