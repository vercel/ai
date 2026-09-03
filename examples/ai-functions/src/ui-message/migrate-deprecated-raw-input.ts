import { convertToModelMessages, isToolUIPart, type UIMessage } from 'ai';

type MessagePart = UIMessage['parts'][number];

function migrateDeprecatedRawInput(messages: UIMessage[]): UIMessage[] {
  return messages.map(message => ({
    ...message,
    parts: message.parts.map(part => {
      if (
        !isToolUIPart(part) ||
        part.state !== 'output-error' ||
        !('rawInput' in part) ||
        part.rawInput === undefined
      ) {
        return part;
      }

      const { rawInput, ...partWithoutRawInput } = part;

      return {
        ...partWithoutRawInput,
        input: part.input !== undefined ? part.input : rawInput,
      } as MessagePart;
    }),
  }));
}

const persistedMessages: UIMessage[] = [
  {
    id: 'assistant-1',
    role: 'assistant',
    parts: [
      {
        type: 'tool-weather',
        toolCallId: 'call-1',
        state: 'output-error',
        input: undefined,
        rawInput: '{"city":',
        errorText: 'Invalid tool input',
      },
    ],
  },
];

const migratedMessages = migrateDeprecatedRawInput(persistedMessages);
const modelMessages = await convertToModelMessages(migratedMessages);

console.log(JSON.stringify(modelMessages, null, 2));
