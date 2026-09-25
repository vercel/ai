import {
  HarnessAgent,
  createFileReporter,
  createTraceTreeReporter,
} from '@ai-sdk/harness/agent';
import { grokBuild } from '@ai-sdk/harness-grok-build';
import { getUserNameTool } from '@/lib/tools/get-user-name-tool';
import { isStepCount } from 'ai';

export const grokBuildSteppedWorkflowAgent = new HarnessAgent({
  harness: grokBuild,
  tools: { getUserName: getUserNameTool },
  stopWhen: isStepCount(1),
  debug: { enabled: true },
  telemetry: {
    integrations: [
      createTraceTreeReporter(),
      createFileReporter({
        dir: '.harness-observability/grok-build/workflow-stepped',
      }),
    ],
  },
});
