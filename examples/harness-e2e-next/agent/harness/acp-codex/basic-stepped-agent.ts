import {
  HarnessAgent,
  createFileReporter,
  createTraceTreeReporter,
} from '@ai-sdk/harness/agent';
import { codexACPHarness } from './harness';
import { getUserNameTool } from '@/lib/tools/get-user-name-tool';
import { isStepCount } from 'ai';

export const codexACPSteppedWorkflowAgent = new HarnessAgent({
  harness: codexACPHarness,
  tools: { getUserName: getUserNameTool },
  stopWhen: isStepCount(1),
  debug: { enabled: true },
  telemetry: {
    integrations: [
      createTraceTreeReporter(),
      createFileReporter({
        dir: '.harness-observability/acp-codex/workflow-stepped',
      }),
    ],
  },
});
