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
  CONTEXT = any,
  RESULT = any,
> = {
  type?: undefined | 'function';
  description?: string;
  parameters: PARAMETERS;
  execute: (
    args: inferParameters<PARAMETERS>,
    options: {
      abortSignal?: AbortSignal;
      context: CONTEXT;
    },
  ) => PromiseLike<RESULT>;
};

export type AgentHandoverTool<
  PARAMETERS extends Parameters = any,
  CONTEXT = any,
> = {
  type: 'handover';
  description?: string;
  parameters: PARAMETERS;
  execute: (
    args: inferParameters<PARAMETERS>,
    options: {
      abortSignal?: AbortSignal;
      context: CONTEXT;
    },
  ) => {
    agent: Agent<CONTEXT>;
    context?: CONTEXT;
  };
};

export type AgentTool<CONTEXT = any> =
  | AgentFunctionTool<any, CONTEXT, any>
  | AgentHandoverTool<any, CONTEXT>;

// TODO other settings such as temperature, etc.
export class Agent<CONTEXT = any> {
  readonly name: string;
  readonly model: LanguageModel | undefined;
  readonly system: ((context: CONTEXT) => string) | string | undefined;
  readonly tools: Record<string, AgentTool<CONTEXT>> | undefined;

  constructor(options: {
    name: string;
    system?: ((context: CONTEXT) => string) | string | undefined;
    model?: LanguageModel;
    tools?: Record<string, AgentTool>;
  }) {
    this.name = options.name;
    this.model = options.model;
    this.system = options.system;
    this.tools = options.tools;
  }
}
