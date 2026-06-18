import {
  HarnessAgent,
  createFileReporter,
  createTraceTreeReporter,
} from '@ai-sdk/harness/agent';
import { grokBuild } from '@ai-sdk/harness-grok-build';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { InferUITools, UIMessage } from 'ai';

export const grokBuildHarnessAgent = new HarnessAgent({
  harness: grokBuild,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
  debug: { enabled: true },
  telemetry: {
    integrations: [
      createTraceTreeReporter(),
      createFileReporter({ dir: '.harness-observability/grok-build/basic' }),
    ],
  },
});

export type GrokBuildHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof grokBuildHarnessAgent.tools>
>;
