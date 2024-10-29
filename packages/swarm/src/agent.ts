import { CoreTool, LanguageModel } from 'ai';

export interface Agent {
  name: string;
  model: LanguageModel;
  system: string;
  tools: Record<string, CoreTool>;
}
