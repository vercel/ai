import {
  HarnessAgent,
  createFileReporter,
  createTraceTreeReporter,
} from '@ai-sdk/harness/agent';
import { githubCopilot } from '@ai-sdk/harness-github-copilot';
import { getUserNameTool } from '@/lib/tools/get-user-name-tool';
import { isStepCount } from 'ai';

export const githubCopilotSteppedWorkflowAgent = new HarnessAgent({
  harness: githubCopilot,
  tools: { getUserName: getUserNameTool },
  stopWhen: isStepCount(1),
  debug: { enabled: true },
  telemetry: {
    integrations: [
      createTraceTreeReporter(),
      createFileReporter({
        dir: '.harness-observability/github-copilot/workflow-stepped',
      }),
    ],
  },
});
