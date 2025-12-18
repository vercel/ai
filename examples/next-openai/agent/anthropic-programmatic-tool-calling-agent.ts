import { weatherToolWithProgrammaticCalling } from '@/tool/weather-tool-with-programmatic-calling';
import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { InferAgentUIMessage, ToolLoopAgent } from 'ai';
import { z } from 'zod';

export const anthropicProgrammaticToolCallingAgent = new ToolLoopAgent({
  model: anthropic('claude-sonnet-4-5'),
  callOptionsSchema: z.object({
    containerId: z.string().optional(),
  }),
  tools: {
    code_execution: anthropic.tools.codeExecution_20250825(),
    weather: weatherToolWithProgrammaticCalling,
  },

  prepareCall: ({ options, ...rest }) => ({
    ...rest,
    providerOptions: {
      anthropic: {
        container: {
          id: options?.containerId,
        },
      } satisfies AnthropicProviderOptions as any,
    },
  }),

  // Pass container ID between steps within the same stream
  prepareStep: ({ steps }) => {
    const lastStep = steps.at(-1);
    const containerId = (
      lastStep?.providerMetadata?.anthropic as { container?: { id?: string } }
    )?.container?.id;

    if (containerId) {
      return {
        providerOptions: {
          anthropic: {
            container: {
              id: containerId,
            },
          } satisfies AnthropicProviderOptions as any,
        },
      };
    }
    return undefined;
  },
});

export type AnthropicProgrammaticToolCallingMessage = InferAgentUIMessage<
  typeof anthropicProgrammaticToolCallingAgent
>;
