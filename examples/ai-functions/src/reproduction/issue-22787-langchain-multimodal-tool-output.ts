import assert from 'node:assert/strict';
import { convertModelMessages } from '@ai-sdk/langchain';
import type { ModelMessage } from 'ai';

async function main() {
  const messages: ModelMessage[] = [
    {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolName: 'lookup',
          toolCallId: 'call1',
          output: {
            type: 'content',
            value: [
              { type: 'text', text: 'image attached' },
              {
                type: 'file',
                mediaType: 'image/png',
                data: { type: 'data', data: 'iVBORw0KGgo=' },
              },
            ],
          },
        },
      ],
    },
  ];

  const [result] = convertModelMessages(messages);
  assert.ok(result, 'convertModelMessages must return the tool message');

  console.log('Converted ToolMessage content:', result.content);

  assert.ok(
    Array.isArray(result.content),
    'ISSUE_22787: convertModelMessages silently dropped the image tool-output block',
  );
  assert.equal(
    result.content.length,
    2,
    'the converted ToolMessage must retain both tool-output blocks',
  );

  const [textBlock, imageBlock] = result.content;
  assert.deepEqual(textBlock, {
    type: 'text',
    text: 'image attached',
  });
  assert.equal(imageBlock.type, 'image');
  assert.equal(imageBlock.data, 'iVBORw0KGgo=');
  assert.equal(imageBlock.mimeType, 'image/png');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
