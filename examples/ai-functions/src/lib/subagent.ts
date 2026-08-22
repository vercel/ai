import {
  type Agent,
  type ToolLoopAgent,
  type Output,
  type Tool,
  type ModelMessage,
  type ToolExecutionOptions,
} from 'ai';
import * as z from 'zod';

export function subagent<AGENT extends ToolLoopAgent<any, any, any, any>>({
  description,
  agent,
  prompt,
}: {
  description: string;
  agent: AGENT;
  prompt:
    | string
    | Array<ModelMessage>
    | ((
        input: InferAgentCallOptions<AGENT>,
        options: ToolExecutionOptions<never>,
      ) => string | Array<ModelMessage>);
}): Tool<
  InferAgentCallOptions<AGENT>,
  Output.Output<AGENT['settings']['output']>
> {
  return {
    description,
    inputSchema:
      agent.settings.callOptionsSchema ?? z.object({ prompt: z.string() }),
    execute: async (
      input: InferAgentCallOptions<AGENT>,
      options: ToolExecutionOptions<never>,
    ) => {
      const result = await agent.generate({
        prompt: typeof prompt === 'function' ? prompt(input, options) : prompt,
        options: input as any,
      });
      return result.output;
    },
  } as unknown as Tool<
    InferAgentCallOptions<AGENT>,
    Output.Output<AGENT['settings']['output']>
  >;
}

type InferAgentCallOptions<AGENT extends Agent<any, any, any, any>> =
  AGENT extends ToolLoopAgent<infer CALL_OPTIONS, any, any, any>
    ? CALL_OPTIONS
    : never;
