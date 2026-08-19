import {
  HarnessAgent,
  createFileReporter,
  createTraceTreeReporter,
} from '@ai-sdk/harness/agent';
import { deepAgents } from '@ai-sdk/harness-deepagents';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import { getUserNameTool } from '@/lib/tools/get-user-name-tool';
import { isStepCount } from 'ai';

export const deepAgentsSteppedWorkflowAgent = new HarnessAgent({
  harness: deepAgents,
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
        dir: '.harness-observability/deepagents/workflow-stepped',
      }),
    ],
  },
});
