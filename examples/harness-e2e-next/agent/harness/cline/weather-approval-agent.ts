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
import { cline } from '@ai-sdk/harness-cline';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { InferUITools, UIMessage } from 'ai';

export const weatherApprovalClineHarnessAgent = new HarnessAgent({
  harness: cline,
  instructions: weatherInstructions,
  skills: [weatherForecastSkill, weatherCodesSkill],
  tools: { get_weather: weatherTool },
  toolApproval: {
    get_weather: 'user-approval',
  },
  permissionMode: 'allow-edits',
  sandbox: createVercelSandbox({
    runtime: 'node24',
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
        dir: '.harness-observability/cline/weather-approval',
      }),
    ],
  },
});

export type WeatherApprovalClineHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof weatherApprovalClineHarnessAgent.tools>
>;
