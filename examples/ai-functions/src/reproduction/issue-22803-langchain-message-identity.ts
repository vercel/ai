import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { toBaseMessages } from '@ai-sdk/langchain';
import type { UIMessage } from 'ai';

type ReducedMessage = {
  content: unknown;
  id?: string | null;
};

type MessagesStateReducer = (
  left: ReducedMessage[],
  right: ReducedMessage[],
) => ReducedMessage[];

const requireFromLangChainPackage = createRequire(
  new URL('../../../../packages/langchain/package.json', import.meta.url),
);
const { messagesStateReducer } = requireFromLangChainPackage(
  '@langchain/langgraph',
) as {
  messagesStateReducer: MessagesStateReducer;
};

async function main() {
  const repeatedUserMessage: UIMessage[] = [
    {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'hello' }],
    },
  ];
  const firstUserConversion = await toBaseMessages(repeatedUserMessage);
  const secondUserConversion = await toBaseMessages(repeatedUserMessage);
  const userIdsBeforeReduction = [
    firstUserConversion[0]?.id ?? null,
    secondUserConversion[0]?.id ?? null,
  ];
  const repeatedUserState = messagesStateReducer(
    messagesStateReducer([], firstUserConversion),
    secondUserConversion,
  );

  const assistantWithStepsAndToolResult = [
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [
        { type: 'text', text: 'Checking the weather.' },
        {
          type: 'tool-weather',
          toolCallId: 'weather-1',
          state: 'output-available',
          input: { city: 'Berlin' },
          output: { temperature: 20 },
        },
        { type: 'step-start' },
        { type: 'text', text: 'It is 20°C.' },
      ],
    },
  ] as UIMessage[];
  const firstAssistantConversion = await toBaseMessages(
    assistantWithStepsAndToolResult,
  );
  const secondAssistantConversion = await toBaseMessages(
    assistantWithStepsAndToolResult,
  );
  const assistantIdsBeforeReduction = {
    first: firstAssistantConversion.map(message => message.id ?? null),
    second: secondAssistantConversion.map(message => message.id ?? null),
  };
  const repeatedAssistantState = messagesStateReducer(
    messagesStateReducer([], firstAssistantConversion),
    secondAssistantConversion,
  );

  const equalTextWithDistinctIds: UIMessage[] = [
    {
      id: 'user-equal-1',
      role: 'user',
      parts: [{ type: 'text', text: 'same text' }],
    },
    {
      id: 'user-equal-2',
      role: 'user',
      parts: [{ type: 'text', text: 'same text' }],
    },
  ];
  const distinctEqualTextState = messagesStateReducer(
    [],
    await toBaseMessages(equalTextWithDistinctIds),
  );

  const observed = {
    userIdsBeforeReduction,
    messagesAfterRepeatedUserUpdate: repeatedUserState.length,
    assistantIdsBeforeReduction,
    assistantMessagesPerConversion: firstAssistantConversion.length,
    messagesAfterRepeatedAssistantUpdate: repeatedAssistantState.length,
    messagesForDistinctEqualText: distinctEqualTextState.length,
  };
  console.log(JSON.stringify(observed, null, 2));

  assert.equal(
    repeatedUserState.length,
    firstUserConversion.length,
    'Issue #22803: repeated conversion of one UI user message must update one LangGraph message',
  );
  assert.equal(
    repeatedAssistantState.length,
    firstAssistantConversion.length,
    'Issue #22803: repeated conversion of one assistant UI message must update its expanded LangGraph messages',
  );
  assert.equal(
    distinctEqualTextState.length,
    equalTextWithDistinctIds.length,
    'Issue #22803: distinct UI message IDs with equal text must remain distinct',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
