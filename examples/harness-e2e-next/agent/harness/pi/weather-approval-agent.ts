import { weatherTool } from '@/lib/tools/weather-tool';
import {
  WEATHER_CODES_REFERENCE,
  weatherCodesSkill,
  weatherForecastSkill,
  weatherInstructions,
} from '@/lib/weather-utils';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import {
  createFileReporter,
  createTraceTreeReporter,
} from '@ai-sdk/harness/observability';
import { pi } from '@ai-sdk/harness-pi';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { InferUITools, UIMessage } from 'ai';

export const weatherApprovalPiHarnessAgent = new HarnessAgent({
  harness: pi,
  instructions: weatherInstructions,
  skills: [weatherForecastSkill, weatherCodesSkill],
  tools: { get_weather: weatherTool },
  toolApproval: {
    get_weather: 'user-approval',
  },
  sandbox: createVercelSandbox({
    runtime: 'node24',
    setup: async ({ session, sessionWorkDir, abortSignal }) => {
      await session.writeTextFile({
        path: `${sessionWorkDir}/weather-codes.md`,
        content: WEATHER_CODES_REFERENCE,
        abortSignal,
      });
    },
  }),
  debug: { enabled: true },
  telemetry: {
    integrations: [
      createTraceTreeReporter(),
      createFileReporter({ dir: '.harness-observability/pi/weather-approval' }),
    ],
  },
});

export type WeatherApprovalPiHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof weatherApprovalPiHarnessAgent.tools>
>;
