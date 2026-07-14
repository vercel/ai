import assert from 'node:assert/strict';
import {
  safeValidateUIMessages,
  type SafeValidateUIMessagesResult,
  type UIMessage,
} from 'ai';

function summarize(result: SafeValidateUIMessagesResult<UIMessage>) {
  return result.success
    ? { success: true }
    : {
        success: false,
        errorName: result.error.name,
        errorMessage: result.error.message,
      };
}

async function main() {
  const persistedMessages: UIMessage[] = [
    {
      id: 'user-1',
      role: 'user',
      parts: [{ type: 'text', text: 'Hello' }],
    },
    {
      id: 'assistant-1',
      role: 'assistant',
      parts: [],
    },
  ];

  const control = await safeValidateUIMessages({
    messages: persistedMessages.slice(0, 1),
  });
  assert.equal(
    control.success,
    true,
    'the valid persisted prefix must validate',
  );

  const result = await safeValidateUIMessages({ messages: persistedMessages });
  console.log(JSON.stringify(summarize(result), null, 2));

  assert.equal(
    result.success,
    true,
    'a persisted chat must remain loadable when an errored assistant response has empty parts',
  );
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
