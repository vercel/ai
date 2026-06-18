import {
  createFileReporter,
  createTraceTreeReporter,
  HarnessAgent,
} from '@ai-sdk/harness/agent';
import { deepAgents } from '@ai-sdk/harness-deepagents';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { InferUITools, UIMessage } from 'ai';

export const deepAgentsHarnessAgent = new HarnessAgent({
  harness: deepAgents,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
  // Observability wired in code (dev/testing app). Trace tree + diagnostics
  // print to the terminal; the file reporter writes a per-agent `events.jsonl`.
  debug: { enabled: true },
  telemetry: {
    integrations: [
      createTraceTreeReporter(),
      createFileReporter({ dir: '.harness-observability/deepagents/basic' }),
    ],
  },
});

/*
 * Derived from `agent.tools` directly rather than `InferAgentUIMessage<typeof
 * agent>` — see the note in the OpenCode/Codex basic agents for why the
 * structural inference is side-stepped via the `tools` field.
 */
export type DeepAgentsHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof deepAgentsHarnessAgent.tools>
>;
