import { convertModelMessages } from '@ai-sdk/langchain';
import type { ModelMessage } from 'ai';

type ContentBlock = Record<string, unknown>;

function getOnlyContentBlock(message: ModelMessage): ContentBlock {
  const [converted] = convertModelMessages([message]);
  const { content } = converted;

  if (!Array.isArray(content) || content.length !== 1) {
    throw new Error(
      `Expected one LangChain content block, received ${JSON.stringify(content)}`,
    );
  }

  return content[0] as ContentBlock;
}

function preservesTaggedText(block: ContentBlock, text: string): boolean {
  const expectedBase64 = Buffer.from(text, 'utf8').toString('base64');

  return (
    (block.type === 'file' && block.data === expectedBase64) ||
    (block.type === 'text-plain' && block.text === text) ||
    (block.type === 'file' &&
      block.source_type === 'text' &&
      block.text === text)
  );
}

async function main() {
  const taggedTextCases = [
    { name: 'ASCII text', text: 'hello world' },
    { name: 'Unicode text', text: 'こんにちは 🌍' },
    { name: 'empty text', text: '' },
    { name: 'URL-looking text', text: 'https://example.com/note.txt' },
    {
      name: 'data-URL-looking text',
      text: 'data:text/plain;base64,aGVsbG8=',
    },
  ];

  const failures: Array<{
    name: string;
    text: string;
    block: ContentBlock;
  }> = [];

  for (const testCase of taggedTextCases) {
    const block = getOnlyContentBlock({
      role: 'user',
      content: [
        {
          type: 'file',
          mediaType: 'text/plain',
          filename: 'note.txt',
          data: { type: 'text', text: testCase.text },
        },
      ],
    });

    if (!preservesTaggedText(block, testCase.text)) {
      failures.push({ ...testCase, block });
    }
  }

  const existingBase64 = Buffer.from('already encoded', 'utf8').toString(
    'base64',
  );
  const existingBase64Block = getOnlyContentBlock({
    role: 'user',
    content: [
      {
        type: 'file',
        mediaType: 'text/plain',
        filename: 'encoded.txt',
        data: { type: 'data', data: existingBase64 },
      },
    ],
  });

  if (
    existingBase64Block.type !== 'file' ||
    existingBase64Block.data !== existingBase64
  ) {
    throw new Error(
      `Tagged base64 file data was not preserved: ${JSON.stringify(existingBase64Block)}`,
    );
  }

  if (failures.length > 0) {
    throw new Error(
      'ISSUE_22785: tagged text file data was not preserved as UTF-8 base64 or plaintext\n' +
        JSON.stringify(failures),
    );
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
