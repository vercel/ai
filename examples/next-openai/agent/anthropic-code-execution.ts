import { anthropic } from '@ai-sdk/anthropic';
import {
  Experimental_Agent as BasicAgent,
  Experimental_InferAgentUIMessage as InferAgentUIMessage,
} from 'ai';

export const anthropicCodeExecutionAgent = new BasicAgent({
  model: anthropic('claude-sonnet-4-5'),
  tools: {
    code_execution: anthropic.tools.codeExecution_20250825(),
  },
});

export type AnthropicCodeExecutionMessage = InferAgentUIMessage<
  typeof anthropicCodeExecutionAgent
>;
