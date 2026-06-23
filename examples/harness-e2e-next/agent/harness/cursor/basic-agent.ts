import {
  HarnessAgent,
  createFileReporter,
  createTraceTreeReporter,
} from '@ai-sdk/harness/agent';
import { cursor } from '@ai-sdk/harness-cursor';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { InferUITools, UIMessage } from 'ai';

export const cursorHarnessAgent = new HarnessAgent({
  harness: cursor,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
  debug: { enabled: true },
  telemetry: {
    integrations: [
      createTraceTreeReporter(),
      createFileReporter({ dir: '.harness-observability/cursor/basic' }),
    ],
  },
});

export type CursorHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof cursorHarnessAgent.tools>
>;
