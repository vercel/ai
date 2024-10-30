import { LanguageModel, Schema } from 'ai';
import { z } from 'zod';

type Parameters = z.ZodTypeAny | Schema<any>;
type inferParameters<PARAMETERS extends Parameters> =
  PARAMETERS extends Schema<any>
    ? PARAMETERS['_type']
    : PARAMETERS extends z.ZodTypeAny
    ? z.infer<PARAMETERS>
    : never;

export type AgentFunctionTool<
  PARAMETERS extends Parameters = any,
  RESULT = any,
> = {
  type?: undefined | 'function';
  description?: string;
  parameters: PARAMETERS;
  execute: (
    args: inferParameters<PARAMETERS>,
    options: { abortSignal?: AbortSignal },
  ) => PromiseLike<RESULT>;
};

export type AgentHandoverTool = {
  type: 'handover';
  description?: string;
  agent: () => Agent;
};

export type AgentTool = AgentFunctionTool | AgentHandoverTool;

// TODO other settings such as temperature, etc.
export class Agent {
  readonly name: string;
  readonly model: LanguageModel | undefined;
  readonly system: string | undefined;
  readonly tools: Record<string, AgentTool> | undefined;

  constructor(options: {
    name: string;
    system?: string;
    model?: LanguageModel;
    tools?: Record<string, AgentTool>;
  }) {
    this.name = options.name;
    this.model = options.model;
    this.system = options.system;
    this.tools = options.tools;
  }
}
