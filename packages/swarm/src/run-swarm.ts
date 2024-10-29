import {
  CoreMessage,
  CoreTool,
  FinishReason,
  generateText,
  GenerateTextResult,
  LanguageModel,
} from 'ai';
import { Agent } from './agent';
import { z } from 'zod';

export async function runSwarm({
  agent,
  messages: initialMessages,
  context = {},
  defaultModel,
  maxSteps = 100,
}: {
  agent: Agent;
  messages: CoreMessage[];
  defaultModel: LanguageModel;
  context?: Record<string, any>;
  maxSteps?: number;
}): Promise<{
  text: string;
  responseMessages: CoreMessage[];
  activeAgent: Agent;
  finishReason: FinishReason;
}> {
  const variables = { ...context }; // TODO use context

  let activeAgent = agent;
  let lastResult: GenerateTextResult<Record<string, CoreTool>>;
  const responseMessages: Array<CoreMessage> = [];

  do {
    lastResult = await generateText({
      model: agent.model ?? defaultModel,
      system: agent.system,
      tools: Object.fromEntries(
        Object.entries(agent.tools ?? {}).map(
          ([name, tool]): [string, CoreTool] => [
            name,
            tool.type === 'agent'
              ? {
                  type: 'function',
                  description: tool.description,
                  parameters: z.object({}),
                  // no execute function
                }
              : tool,
          ],
        ),
      ),
      maxSteps,
      messages: [...initialMessages, ...responseMessages],
    });

    responseMessages.push(...lastResult.response.messages);

    switch (lastResult.finishReason) {
      case 'tool-calls': {
        // TODO handle tool calls and agent switching
        // TODO introduce special agent tools and mapping to CoreTool
      }

      case 'stop':
      default:
        break;
    }
  } while (
    responseMessages.filter(message => message.role === 'assistant').length <
    maxSteps
  );

  return {
    responseMessages,
    activeAgent,
    text: lastResult.text,
    finishReason: lastResult.finishReason,
  };
}
