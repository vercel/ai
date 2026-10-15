import {
  HarnessAgent,
  createFileReporter,
  createTraceTreeReporter,
} from '@ai-sdk/harness/agent';
import { claudeCodeACPHarness } from './harness';
import { getUserNameTool } from '@/lib/tools/get-user-name-tool';
import { isStepCount } from 'ai';

export const claudeCodeACPSteppedWorkflowAgent = new HarnessAgent({
  harness: claudeCodeACPHarness,
  tools: { getUserName: getUserNameTool },
  stopWhen: isStepCount(1),
  debug: { enabled: true },
  telemetry: {
    integrations: [
      createTraceTreeReporter(),
      createFileReporter({
        dir: '.harness-observability/acp-claude-code/workflow-stepped',
      }),
    ],
  },
});
