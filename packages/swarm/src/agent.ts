import { CoreTool, LanguageModel } from 'ai';

export type AgentTool =
  | CoreTool
  | {
      type: 'agent';
      description: string;
      agent: () => Agent;
    };

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
