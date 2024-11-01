import { CoreToolChoice, LanguageModel, Schema } from 'ai';
import { z } from 'zod';

type Parameters = z.ZodTypeAny | Schema<any>;
type inferParameters<PARAMETERS extends Parameters> =
  PARAMETERS extends Schema<any>
    ? PARAMETERS['_type']
    : PARAMETERS extends z.ZodTypeAny
    ? z.infer<PARAMETERS>
    : never;

export type AgentFunctionTool<
  CONTEXT = any,
  PARAMETERS extends Parameters = any,
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

export function functionTool<
  CONTEXT = any,
  PARAMETERS extends Parameters = any,
>(tool: {
  type?: 'function';
  description?: string;
  parameters: PARAMETERS;
  execute: AgentFunctionTool<CONTEXT, PARAMETERS>['execute'];
}): AgentFunctionTool<CONTEXT, PARAMETERS> {
  return tool;
}

export type AgentHandoverTool<
  CONTEXT = any,
  PARAMETERS extends Parameters = any,
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

export function handoverTool<
  CONTEXT = any,
  PARAMETERS extends Parameters = any,
>(tool: {
  type: 'handover';
  description?: string;
  parameters: PARAMETERS;
  execute: AgentHandoverTool<CONTEXT, PARAMETERS>['execute'];
}): AgentHandoverTool<CONTEXT, PARAMETERS> {
  return tool;
}

export type AgentTool<CONTEXT = any> =
  | AgentFunctionTool<CONTEXT, any, any>
  | AgentHandoverTool<CONTEXT, any>;

// TODO other settings such as temperature, etc.
export class Agent<CONTEXT = any> {
  readonly name: string;
  readonly model: LanguageModel | undefined;
  readonly system: ((context: CONTEXT) => string) | string | undefined;
  readonly tools: Record<string, AgentTool<CONTEXT>> | undefined;
  readonly toolChoice: CoreToolChoice<any> | undefined;

  constructor(options: {
    name: string;
    system?: ((context: CONTEXT) => string) | string | undefined;
    model?: LanguageModel;
    tools?: Record<string, AgentTool>;
    toolChoice?: CoreToolChoice<any>;
  }) {
    this.name = options.name;
    this.model = options.model;
    this.system = options.system;
    this.tools = options.tools;
    this.toolChoice = options.toolChoice;
  }
}
