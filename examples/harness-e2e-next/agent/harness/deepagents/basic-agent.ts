import {
  createFileReporter,
  createTraceTreeReporter,
  HarnessAgent,
} from '@ai-sdk/harness/agent';
import { deepAgents } from '@ai-sdk/harness-deepagents';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { getUserNameTool } from '@/lib/tools/get-user-name-tool';
import type { InferUITools, UIMessage } from 'ai';

export const deepAgentsHarnessAgent = new HarnessAgent({
  harness: deepAgents,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
  tools: { getUserName: getUserNameTool },
  debug: { enabled: true },
  telemetry: {
    integrations: [
      createTraceTreeReporter(),
      createFileReporter({ dir: '.harness-observability/deepagents/basic' }),
    ],
  },
});

// Derived from `agent.tools` (not InferAgentUIMessage) — see Codex/OpenCode basic agents.
export type DeepAgentsHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof deepAgentsHarnessAgent.tools>
>;
