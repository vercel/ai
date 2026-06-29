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
import { grokBuild } from '@ai-sdk/harness-grok-build';
import { createVercelSandbox } from '@ai-sdk/sandbox-vercel';
import type { InferUITools, UIMessage } from 'ai';

export const weatherGrokBuildHarnessAgent = new HarnessAgent({
  harness: grokBuild,
  instructions: weatherInstructions,
  skills: [weatherForecastSkill, weatherCodesSkill],
  tools: { get_weather: weatherTool },
  sandbox: createVercelSandbox({
    runtime: 'node24',
    ports: [4000],
  }),
  onSandboxSession: async ({ session, sessionWorkDir, abortSignal }) => {
    await session.writeTextFile({
      path: `${sessionWorkDir}/weather-codes.md`,
      content: WEATHER_CODES_REFERENCE,
      abortSignal,
    });
  },
  telemetry: {
    integrations: [
      createTraceTreeReporter(),
      createFileReporter({ dir: '.harness-observability/grok-build/weather' }),
    ],
  },
});

export type WeatherGrokBuildHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof weatherGrokBuildHarnessAgent.tools>
>;
