import { CoreMessage, generateId, Message, ToolInvocation } from 'ai';
import { existsSync, mkdirSync } from 'fs';
import { readFile, writeFile } from 'fs/promises';
import path from 'path';

// example implementation for demo purposes
// in a real app, you would save the chat to a database.
export async function saveChat({
  id,
  messages,
}: {
  id: string;
  messages: Message[];
}): Promise<void> {
  await writeFile(getChatFile(id), JSON.stringify(messages, null, 2));
}

export async function loadChat({ id }: { id: string }): Promise<Message[]> {
  return JSON.parse(await readFile(getChatFile(id), 'utf8'));
}

function getChatFile(chatId: string): string {
  const chatDir = path.join(process.cwd(), '.chats');

  if (!existsSync(chatDir)) {
    mkdirSync(chatDir, { recursive: true });
  }

  return path.join(chatDir, `${chatId}.json`);
}

/**
 * Merges the CoreMessage[] from the response with the Message[] from the request.
 */
export function mergeMessages({
  requestMessages,
  responseMessages,
}: {
  requestMessages: Message[];
  responseMessages: CoreMessage[];
}): Message[] {
  const messages = structuredClone(requestMessages);

  for (const message of responseMessages) {
    const role = message.role;

    switch (role) {
      case 'system':
      case 'user': {
        throw new Error(
          'AI response must not contain system or user messages: ' + role,
        );
      }

      case 'assistant': {
        messages.push({
          role: 'assistant',
          id: generateId(), // generate an id for the message, will be overridden by the client
          createdAt: new Date(), // generate a createdAt date for the message, will be overridden by the client

          // only include text in the content:
          content:
            typeof message.content === 'string'
              ? message.content
              : message.content
                  .filter(part => part.type === 'text')
                  .map(part => part.text)
                  .join(''),

          // separate tool calls from the content:
          toolInvocations: (typeof message.content === 'string'
            ? []
            : message.content.filter(part => part.type === 'tool-call')
          ).map(call => ({
            state: 'call',
            ...call,
          })),
        });

        break;
      }

      case 'tool': {
        // for tool call results, add the result to previous message:
        const previousMessage = messages[messages.length - 1];
        previousMessage.toolInvocations ??= []; // ensure the toolInvocations array exists

        if (previousMessage.role !== 'assistant') {
          throw new Error(
            `Tool result must follow an assistant message: ${previousMessage.role}`,
          );
        }

        for (const part of message.content) {
          // find the tool call in the previous message:
          const toolCall = previousMessage.toolInvocations.find(
            call => call.toolCallId === toolResult.toolCallId,
          );

          if (!toolCall) {
            throw new Error('Tool call not found in previous message');
          }

          // add the result to the tool call:
          toolCall.state = 'result';
          const toolResult = toolCall as ToolInvocation & { state: 'result' };
          toolResult.result = part.result;
        }

        break;
      }
    }
  }

  return messages;
}
