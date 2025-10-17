<<<<<<< HEAD:examples/next-openai/agent/anthropic-code-execution.ts
import { anthropic } from '@ai-sdk/anthropic';
import {
  Experimental_Agent as BasicAgent,
  Experimental_InferAgentUIMessage as InferAgentUIMessage,
} from 'ai';
=======
import { anthropic, AnthropicProviderOptions } from '@ai-sdk/anthropic';
import { BasicAgent, InferAgentUIMessage } from 'ai';
>>>>>>> 93542976f (feat(provider/anthropic): implement support for Claude Agent Skills (#9597)):examples/next-openai/agent/anthropic-code-execution-agent.ts

export const anthropicCodeExecutionAgent = new BasicAgent({
  model: anthropic('claude-sonnet-4-5'),
  tools: {
    code_execution: anthropic.tools.codeExecution_20250825(),
  },
  providerOptions: {
    anthropic: {
      container: {
        skills: [{ type: 'anthropic', skillId: 'pdf' }],
      },
    } satisfies AnthropicProviderOptions,
  },
});

export type AnthropicCodeExecutionMessage = InferAgentUIMessage<
  typeof anthropicCodeExecutionAgent
>;
