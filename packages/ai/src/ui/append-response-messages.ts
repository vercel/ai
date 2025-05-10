import { AISDKError } from '@ai-sdk/provider';
import { ResponseMessage } from '../../core/generate-text/response-message';
import { convertDataContentToBase64String } from '../../core/prompt/data-content';
import { extractMaxToolInvocationStep } from './extract-max-tool-invocation-step';
import { getToolInvocations } from './get-tool-invocations';
import {
  FileUIPart,
  ReasoningUIPart,
  StepStartUIPart,
  TextUIPart,
  ToolInvocation,
  ToolInvocationUIPart,
  UIMessage,
} from './ui-messages';

/**
 * Appends the ResponseMessage[] from the response to a UIMessage[] (for useChat).
 * The messages are converted to UIMessages before being appended.
 * Timestamps are generated for the new messages.
 *
 * @returns A new UIMessage[] that contains the appended response messages.
 * It can either have a single new UI message, or the last UI message has been updated.
 */
export function appendResponseMessages({
  messages,
  responseMessages,
  messageId,
  _internal: { currentDate = () => new Date() } = {},
}: {
  messages: UIMessage[];
  responseMessages: ResponseMessage[];
  messageId: string;
  /**
Internal. For test use only. May change without notice.
     */
  _internal?: {
    currentDate?: () => Date;
  };
}): UIMessage[] {
  const clonedMessages = structuredClone(messages);

  for (const message of responseMessages) {
    const role = message.role;

    // check if the last message is an assistant message:
    const lastMessage = clonedMessages[clonedMessages.length - 1];
    const isLastMessageAssistant = lastMessage.role === 'assistant';

    switch (role) {
      case 'assistant': {
        function getToolInvocationsForStep(step: number) {
          return (
            typeof message.content === 'string'
              ? []
              : message.content.filter(part => part.type === 'tool-call')
          ).map(call => ({
            state: 'call' as const,
            step,
            args: call.args,
            toolCallId: call.toolCallId,
            toolName: call.toolName,
          }));
        }

        const parts: Array<
          | TextUIPart
          | ReasoningUIPart
          | ToolInvocationUIPart
          | FileUIPart
          | StepStartUIPart
        > = [{ type: 'step-start' as const }]; // always start with a step-start part
        let textContent = '';
        let reasoningTextContent = undefined;

        if (typeof message.content === 'string') {
          textContent = message.content;
          parts.push({
            type: 'text' as const,
            text: message.content,
          });
        } else {
          let reasoningPart: ReasoningUIPart | undefined = undefined;
          for (const part of message.content) {
            switch (part.type) {
              case 'text': {
                reasoningPart = undefined; // reset the reasoning part

                textContent += part.text;
                parts.push({
                  type: 'text' as const,
                  text: part.text,
                });
                break;
              }
              case 'reasoning': {
                if (reasoningPart == null) {
                  reasoningPart = {
                    type: 'reasoning' as const,
                    text: '',
                  };
                  parts.push(reasoningPart);
                }

                reasoningTextContent = (reasoningTextContent ?? '') + part.text;
                reasoningPart.text += part.text;
                reasoningPart.providerMetadata = part.providerOptions;
                break;
              }
              case 'tool-call':
                break;
              case 'file':
                if (part.data instanceof URL) {
                  throw new AISDKError({
                    name: 'InvalidAssistantFileData',
                    message: 'File data cannot be a URL',
                  });
                }
                parts.push({
                  type: 'file' as const,
                  mediaType: part.mediaType,
                  url: `data:${part.mediaType};base64,${convertDataContentToBase64String(part.data)}`,
                });
                break;
            }
          }
        }

        if (isLastMessageAssistant) {
          const maxStep = extractMaxToolInvocationStep(
            getToolInvocations(lastMessage),
          );

          lastMessage.parts ??= [];
          lastMessage.parts.push(...parts);

          getToolInvocationsForStep(maxStep === undefined ? 0 : maxStep + 1)
            .map(call => ({
              type: 'tool-invocation' as const,
              toolInvocation: call,
            }))
            .forEach(part => {
              lastMessage.parts!.push(part);
            });
        } else {
          // last message was a user message, add the assistant message:
          clonedMessages.push({
            role: 'assistant',
            id: messageId,
            createdAt: currentDate(), // generate a createdAt date for the message, will be overridden by the client
            parts: [
              ...parts,
              ...getToolInvocationsForStep(0).map(call => ({
                type: 'tool-invocation' as const,
                toolInvocation: call,
              })),
            ],
          });
        }

        break;
      }

      case 'tool': {
        // for tool call results, add the result to previous message:
        if (lastMessage.role !== 'assistant') {
          throw new Error(
            `Tool result must follow an assistant message: ${lastMessage.role}`,
          );
        }

        lastMessage.parts ??= [];

        for (const contentPart of message.content) {
          // find the tool call in the previous message:
          const toolCall = getToolInvocations(lastMessage).find(
            call => call.toolCallId === contentPart.toolCallId,
          );
          const toolCallPart: ToolInvocationUIPart | undefined =
            lastMessage.parts.find(
              (part): part is ToolInvocationUIPart =>
                part.type === 'tool-invocation' &&
                part.toolInvocation.toolCallId === contentPart.toolCallId,
            );

          if (!toolCall) {
            throw new Error('Tool call not found in previous message');
          }

          // add the result to the tool call:
          toolCall.state = 'result';
          const toolResult = toolCall as ToolInvocation & { state: 'result' };
          toolResult.result = contentPart.result;

          if (toolCallPart) {
            toolCallPart.toolInvocation = toolResult;
          } else {
            lastMessage.parts.push({
              type: 'tool-invocation' as const,
              toolInvocation: toolResult,
            });
          }
        }

        break;
      }

      default: {
        const _exhaustiveCheck: never = role;
        throw new Error(`Unsupported message role: ${_exhaustiveCheck}`);
      }
    }
  }

  return clonedMessages;
}
