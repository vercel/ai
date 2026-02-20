import { openai } from '@ai-sdk/openai';
import { InferAgentUIMessage, ToolLoopAgent } from 'ai';

export const openaiCodeInterpreterAgent = new ToolLoopAgent({
  model: openai('gpt-5-nano'),
  tools: {
    executeCode: openai.tools.codeInterpreter(),
  },
});

export type OpenAICodeInterpreterMessage = InferAgentUIMessage<
  typeof openaiCodeInterpreterAgent
>;
