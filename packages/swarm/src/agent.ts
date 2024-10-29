import { CoreTool, LanguageModel } from 'ai';

export class Agent {
  readonly name: string;
  readonly model: LanguageModel | undefined;
  readonly system: string | undefined;
  readonly tools: Record<string, CoreTool> | undefined;

  constructor(options: {
    name: string;
    system?: string;
    model?: LanguageModel;
    tools?: Record<string, CoreTool>;
  }) {
    this.name = options.name;
    this.model = options.model;
    this.system = options.system;
    this.tools = options.tools;
  }
}
