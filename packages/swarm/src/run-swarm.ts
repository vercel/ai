import { CoreMessage, generateText, LanguageModel } from 'ai';
import { Agent } from './agent';

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
}> {
  let activeAgent = agent;
  const variables = { ...context }; // TODO use context
  const responseMessages: Array<CoreMessage> = [];

  while (
    responseMessages.filter(message => message.role === 'assistant').length <
    maxSteps
  ) {
    const result = await generateText({
      model: agent.model ?? defaultModel,
      system: agent.system,
      tools: agent.tools, // TODO map tools??
      maxSteps,
      messages: [...initialMessages, ...responseMessages],
    });

    responseMessages.push(...result.response.messages);

    switch (result.finishReason) {
      case 'stop':
        return { responseMessages, activeAgent, text: result.text };

      // TODO handle tool calls and agent switching
      // TODO introduce special agent tools and mapping to CoreTool

      default:
        throw new Error(`Unexpected finish reason: ${result.finishReason}`);
    }
  }

  return {
    responseMessages,
    activeAgent,
    text: '',
  };
}
