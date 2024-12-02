import {
  CoreAssistantMessage,
  CoreMessage,
  CoreTool,
  CoreToolChoice,
  CoreToolMessage,
  FinishReason,
  generateText,
  GenerateTextResult,
  LanguageModel,
  StepResult,
  ToolResultPart,
} from 'ai';
import { Agent, AgentHandoverTool } from './agent';
import { z } from 'zod';

// TODO streamSwarm function
export async function runSwarm<CONTEXT = any>({
  agent: activeAgent,
  prompt,
  context,
  model,
  maxSteps = 100,
  toolChoice,
  debug = false,
  onStepFinish, // TODO include agent information
}: {
  agent: Agent;
  prompt: CoreMessage[] | string;
  context?: CONTEXT;
  model: LanguageModel;
  maxSteps?: number;
  toolChoice?: CoreToolChoice<any>;
  debug?: boolean;
  onStepFinish?: (event: StepResult<any>) => Promise<void> | void;
}): Promise<{
  text: string;
  responseMessages: CoreMessage[];
  activeAgent: Agent;
  finishReason: FinishReason;
}> {
  const initialMessages =
    typeof prompt === 'string'
      ? [{ role: 'user' as const, content: prompt }]
      : prompt;

  let lastResult: GenerateTextResult<any, any>;
  const responseMessages: Array<CoreMessage> = [];

  do {
    lastResult = await generateText({
      model: activeAgent.model ?? model,
      system:
        typeof activeAgent.system === 'function'
          ? activeAgent.system(context)
          : activeAgent.system,
      tools: Object.fromEntries(
        Object.entries(activeAgent.tools ?? {}).map(
          ([name, tool]): [string, CoreTool] => [
            name,
            tool.type === 'handover'
              ? {
                  type: 'function',
                  description: tool.description,
                  parameters: z.object({}),
                  // no execute function
                }
              : {
                  type: 'function',
                  description: tool.description,
                  parameters: tool.parameters,
                  execute: (args, { abortSignal }) =>
                    tool.execute(args, { context, abortSignal }),
                },
          ],
        ),
      ),
      maxSteps,
      toolChoice: activeAgent.toolChoice ?? toolChoice,
      onStepFinish,
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
      ]! as AgentHandoverTool<CONTEXT, any>;

      const result = handoverTool.execute(handoverCalls[0].args, {
        context: context as any,
      });

      activeAgent = result.agent;
      context = result.context ?? context; // TODO how to reconcile context?

      if (debug) {
        console.log(`\x1b[36mHanding over to agent ${activeAgent.name}\x1b[0m`);
        if (result.context != null) {
          console.log(
            `\x1b[36mUpdated context: ${JSON.stringify(
              result.context,
              null,
              2,
            )}\x1b[0m`,
          );
        }
      }

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

  // TODO special finish reasons: done, maxSteps, etc.

  return {
    responseMessages,
    activeAgent,
    text: lastResult.text,
    finishReason: lastResult.finishReason,
  };
}
