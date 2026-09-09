import {
  HarnessAgent,
  createFileReporter,
  createTraceTreeReporter,
} from '@ai-sdk/harness/agent';
import { cline } from '@ai-sdk/harness-cline';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { getUserNameTool } from '@/lib/tools/get-user-name-tool';
import { isStepCount } from 'ai';

export const clineSteppedWorkflowAgent = new HarnessAgent({
  harness: cline,
  sandbox: createVercelSandbox({
    runtime: 'node24',
  }),
  tools: { getUserName: getUserNameTool },
  stopWhen: isStepCount(1),
  debug: { enabled: true },
  telemetry: {
    integrations: [
      createTraceTreeReporter(),
      createFileReporter({
        dir: '.harness-observability/cline/workflow-stepped',
      }),
    ],
  },
});
