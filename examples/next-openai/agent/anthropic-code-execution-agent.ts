import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { ToolLoopAgent, InferAgentUIMessage } from 'ai';
import { z } from 'zod';

export const anthropicCodeExecutionAgent = new ToolLoopAgent({
  model: anthropic('claude-sonnet-4-5'),
  callOptionsSchema: z.object({
    containerId: z.string().optional(),
  }),
  tools: {
    code_execution: anthropic.tools.codeExecution_20250825(),
  },

  prepareCall: ({ options, ...rest }) => ({
    ...rest,
    providerOptions: {
      anthropic: {
        container: {
          id: options?.containerId,
          skills: [{ type: 'anthropic', skillId: 'pdf' }],
        },
      } satisfies AnthropicProviderOptions as any, // TODO rm any once JSONObject allows undefined
    },
  }),
});

export type AnthropicCodeExecutionMessage = InferAgentUIMessage<
  typeof anthropicCodeExecutionAgent
>;
