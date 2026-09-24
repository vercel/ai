import { weatherTool } from '@/lib/tools/weather-tool';
import {
  WEATHER_CODES_REFERENCE,
  weatherCodesSkill,
  weatherForecastSkill,
  weatherInstructions,
} from '@/lib/weather-utils';
import {
  HarnessAgent,
  createFileReporter,
  createTraceTreeReporter,
} from '@ai-sdk/harness/agent';
import { grokBuildACPHarness } from './harness';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { InferUITools, UIMessage } from 'ai';

export const weatherApprovalGrokBuildACPHarnessAgent = new HarnessAgent({
  harness: grokBuildACPHarness,
  instructions: weatherInstructions,
  skills: [weatherForecastSkill, weatherCodesSkill],
  tools: { get_weather: weatherTool },
  toolApproval: {
    get_weather: 'user-approval',
  },
  permissionMode: 'allow-edits',
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
  sandboxConfig: {
    onSession: async ({ session, sessionWorkDir, abortSignal }) => {
      await session.writeTextFile({
        path: `${sessionWorkDir}/weather-codes.md`,
        content: WEATHER_CODES_REFERENCE,
        abortSignal,
      });
    },
  },
  debug: { enabled: true },
  telemetry: {
    integrations: [
      createTraceTreeReporter(),
      createFileReporter({
        dir: '.harness-observability/acp-grok-build/weather-approval',
      }),
    ],
  },
});

export type WeatherApprovalGrokBuildACPHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof weatherApprovalGrokBuildACPHarnessAgent.tools>
>;
