import {
  HarnessAgent,
  createFileReporter,
  createTraceTreeReporter,
} from '@ai-sdk/harness/agent';
import { grokBuildACPHarness } from './harness';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { getUserNameTool } from '@/lib/tools/get-user-name-tool';
import { isStepCount } from 'ai';

export const grokBuildACPSteppedWorkflowAgent = new HarnessAgent({
  harness: grokBuildACPHarness,
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
  tools: { getUserName: getUserNameTool },
  stopWhen: isStepCount(1),
  debug: { enabled: true },
  telemetry: {
    integrations: [
      createTraceTreeReporter(),
      createFileReporter({
        dir: '.harness-observability/acp-grok-build/workflow-stepped',
      }),
    ],
  },
});
