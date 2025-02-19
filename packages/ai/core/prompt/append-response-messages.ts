import {
  extractMaxToolInvocationStep,
  Message,
  ToolInvocation,
  ToolInvocationUIPart,
} from '@ai-sdk/ui-utils';
import { ResponseMessage } from '../generate-text/step-result';

/**
 * Appends the ResponseMessage[] from the response to a Message[] (for useChat).
 * The messages are converted to Messages before being appended.
 * Timestamps are generated for the new messages.
 *
 * @returns A new Message[] with the response messages appended.
 */
export function appendResponseMessages({
  messages,
  responseMessages,
  _internal: { currentDate = () => new Date() } = {},
}: {
  messages: Message[];
  responseMessages: ResponseMessage[];

  /**
Internal. For test use only. May change without notice.
     */
  _internal?: {
    currentDate?: () => Date;
  };
}): Message[] {
  const clonedMessages = structuredClone(messages);

  for (const message of responseMessages) {
    const role = message.role;

    // check if the last message is an assistant message:
    const lastMessage = clonedMessages[clonedMessages.length - 1];
    const isLastMessageAssistant = lastMessage.role === 'assistant';

    switch (role) {
      case 'assistant': // only include text in the content:
        const textContent =
          typeof message.content === 'string'
            ? message.content
            : message.content
                .filter(part => part.type === 'text')
                .map(part => part.text)
                .join('');

        function getToolInvocations(step: number) {
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

        if (isLastMessageAssistant) {
          const maxStep = extractMaxToolInvocationStep(
            lastMessage.toolInvocations,
          );

          lastMessage.parts ??= [];

          lastMessage.content = textContent;
          if (textContent.length > 0) {
            lastMessage.parts.push({
              type: 'text' as const,
              text: textContent,
            });
          }

          lastMessage.toolInvocations = [
            ...(lastMessage.toolInvocations ?? []),
            ...getToolInvocations(maxStep === undefined ? 0 : maxStep + 1),
          ];

          getToolInvocations(maxStep === undefined ? 0 : maxStep + 1)
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
            id: message.id,
            createdAt: currentDate(), // generate a createdAt date for the message, will be overridden by the client
            content: textContent,
            toolInvocations: getToolInvocations(0),
            parts: [
              ...(textContent.length > 0
                ? [{ type: 'text' as const, text: textContent }]
                : []),
              ...getToolInvocations(0).map(call => ({
                type: 'tool-invocation' as const,
                toolInvocation: call,
              })),
            ],
          });
        }

        break;

      case 'tool': {
        // for tool call results, add the result to previous message:
        lastMessage.toolInvocations ??= []; // ensure the toolInvocations array exists

        if (lastMessage.role !== 'assistant') {
          throw new Error(
            `Tool result must follow an assistant message: ${lastMessage.role}`,
          );
        }

        lastMessage.parts ??= [];

        for (const contentPart of message.content) {
          // find the tool call in the previous message:
          const toolCall = lastMessage.toolInvocations.find(
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
