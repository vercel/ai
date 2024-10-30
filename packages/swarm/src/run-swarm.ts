import {
  CoreAssistantMessage,
  CoreMessage,
  CoreTool,
  CoreToolMessage,
  FinishReason,
  generateText,
  GenerateTextResult,
  LanguageModel,
  ToolResultPart,
} from 'ai';
import { Agent, AgentHandoverTool } from './agent';
import { z } from 'zod';

export async function runSwarm({
  agent,
  messages: initialMessages,
  context = {},
  model,
  maxSteps = 100,
}: {
  agent: Agent;
  messages: CoreMessage[];
  model: LanguageModel;
  context?: Record<string, any>;
  maxSteps?: number;
  // TODO callbacks
}): Promise<{
  text: string;
  responseMessages: CoreMessage[];
  activeAgent: Agent;
  finishReason: FinishReason;
}> {
  const variables = { ...context }; // TODO use context

  let activeAgent = agent;
  let lastResult: GenerateTextResult<any>;
  const responseMessages: Array<CoreMessage> = [];

  do {
    lastResult = await generateText({
      model: agent.model ?? model,
      system: agent.system,
      tools: Object.fromEntries(
        Object.entries(agent.tools ?? {}).map(
          ([name, tool]): [string, CoreTool] => [
            name,
            tool.type === 'handover'
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

    // unless there is an agent handover, we are done:
    if (lastResult.finishReason !== 'tool-calls') {
      break;
    }

    // the generation stopped with an unhandled tool call
    const { toolCalls, toolResults } = lastResult;
    const toolResultIds = toolResults.map(result => result.toolCallId);
    const unhandledToolCalls = toolCalls.filter(
      toolCall => !toolResultIds.includes(toolCall.toolCallId),
    );

    // process handover calls
    const handoverCalls = unhandledToolCalls.filter(
      toolCall => activeAgent.tools?.[toolCall.toolName].type === 'handover',
    );

    // take the first handover call (other handover calls are ignored)
    let handoverToolResult: ToolResultPart | undefined = undefined;
    if (handoverCalls.length > 0) {
      const handoverTool = activeAgent.tools?.[
        handoverCalls[0].toolName
      ]! as AgentHandoverTool;

      activeAgent = handoverTool.agent();

      handoverToolResult = {
        type: 'tool-result',
        toolCallId: handoverCalls[0].toolCallId,
        toolName: handoverCalls[0].toolName,
        result: `Handing over to agent ${activeAgent.name}`,
      };
    }

    // update last messages
    const toolMessage =
      responseMessages.at(-1)?.role === 'tool'
        ? (responseMessages.at(-1) as CoreToolMessage)
        : undefined;
    const assistantMessage = responseMessages.at(
      toolMessage === undefined ? -1 : -2,
    ) as CoreAssistantMessage;

    // add handover tool result
    if (handoverToolResult != null) {
      if (toolMessage == null) {
        responseMessages.push({ role: 'tool', content: [handoverToolResult] });
      } else {
        toolMessage.content.push(handoverToolResult);
      }
    }

    // clean out unused tool calls
    if (typeof assistantMessage.content !== 'string') {
      const unusedToolCallIds = handoverCalls
        .filter((call, index) => index > 0)
        .map(call => call.toolCallId);

      assistantMessage.content = assistantMessage.content.filter(part => {
        return part.type === 'tool-call'
          ? !unusedToolCallIds.includes(part.toolCallId)
          : true;
      });
    }
  } while (
    responseMessages.filter(message => message.role === 'assistant').length <
    maxSteps
  );

  // TODO special finish reason

  return {
    responseMessages,
    activeAgent,
    text: lastResult.text,
    finishReason: lastResult.finishReason,
  };
}
