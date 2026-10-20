import {
  createFileReporter,
  createTraceTreeReporter,
  HarnessAgent,
} from '@ai-sdk/harness/agent';
import { deepAgents } from '@ai-sdk/harness-deepagents';
import { getUserNameTool } from '@/lib/tools/get-user-name-tool';
import type { InferUITools, UIMessage } from 'ai';

export const deepAgentsHarnessAgent = new HarnessAgent({
  harness: deepAgents,
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
