import assert from 'node:assert/strict';
import { convertToModelMessages } from '../packages/ai/src/ui/convert-to-model-messages';
import { convertToAmazonBedrockChatMessages } from '../packages/amazon-bedrock/src/convert-to-amazon-bedrock-chat-messages';

async function main() {
  const modelMessages = await convertToModelMessages([
    {
      role: 'assistant',
      parts: [
        { type: 'text', text: '' },
        { type: 'step-start' },
        {
          type: 'tool-search',
          toolCallId: 'call_123',
          toolName: 'search',
          state: 'input-available',
          input: { q: 'query' },
        },
      ],
    },
  ] as any);

  console.log('Model messages:');
  console.log(JSON.stringify(modelMessages, null, 2));

  assert.equal(modelMessages.length, 2, 'convertToModelMessages should split at step-start');
  assert.deepEqual(modelMessages[0], {
    role: 'assistant',
    content: [{ type: 'text', text: '' }],
  });

  const bedrockMessages = await convertToAmazonBedrockChatMessages(
    modelMessages as any,
  );

  console.log('Amazon Bedrock Converse messages:');
  console.log(JSON.stringify(bedrockMessages, null, 2));

  const emptyMessages = bedrockMessages.messages.filter(
    message => Array.isArray(message.content) && message.content.length === 0,
  );

  assert.deepEqual(
    emptyMessages,
    [],
    'Reproduced issue #15248: Bedrock conversion emitted a message with content: []',
  );

  assert.deepEqual(bedrockMessages.messages, [
    {
      role: 'assistant',
      content: [
        {
          toolUse: {
            toolUseId: 'call_123',
            name: 'search',
            input: { q: 'query' },
          },
        },
      ],
    },
  ]);

  console.log('No empty Bedrock content arrays were emitted for issue #15248 scenario.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
