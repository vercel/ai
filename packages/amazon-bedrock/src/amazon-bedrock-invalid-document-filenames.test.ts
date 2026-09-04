import type { LanguageModelV4Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import { AmazonBedrockChatLanguageModel } from './amazon-bedrock-chat-language-model';

const invalidFilenames = [
  "John's report.txt",
  'invoice #123.txt',
  'a&b.txt',
  'report,2026.txt',
  'résumé.txt',
  '분기보고서.txt',
  'Report -  Final.txt',
  'a\tb.txt',
  `${'a'.repeat(201)}.txt`,
  '.txt',
];

const liveFixture = JSON.parse(
  fs.readFileSync(
    'src/__fixtures__/amazon-bedrock-invalid-document-filenames.json',
    'utf8',
  ),
) as {
  responses: {
    characterSet: { body: { message: string }; status: number };
    maximumLength: { body: { message: string }; status: number };
    minimumLength: { body: { message: string }; status: number };
  };
};

function isValidDocumentName(name: string) {
  return (
    name.length >= 1 &&
    name.length <= 200 &&
    /^[A-Za-z0-9 ()[\]-]+$/.test(name) &&
    !/\s{2}/.test(name)
  );
}

function getValidationResponse(name: string) {
  if (name.length === 0) {
    return liveFixture.responses.minimumLength;
  }

  if (name.length > 200) {
    return liveFixture.responses.maximumLength;
  }

  return liveFixture.responses.characterSet;
}

const model = new AmazonBedrockChatLanguageModel(
  'us.anthropic.claude-haiku-4-5-20251001-v1:0',
  {
    baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
    headers: {},
    generateId: () => 'test-id',
    fetch: async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        messages: Array<{
          content: Array<{ document?: { name: string } }>;
        }>;
      };
      const documentName = body.messages
        .flatMap(message => message.content)
        .find(part => part.document != null)?.document?.name;

      if (documentName == null) {
        throw new Error('Expected a document in the Bedrock request.');
      }

      if (!isValidDocumentName(documentName)) {
        const response = getValidationResponse(documentName);
        return new Response(JSON.stringify(response.body), {
          status: response.status,
          headers: {
            'content-type': 'application/json',
            'x-amzn-errortype':
              'ValidationException:http://internal.amazon.com/coral/com.amazon.bedrock/',
          },
        });
      }

      return new Response(
        JSON.stringify({
          output: {
            message: {
              role: 'assistant',
              content: [{ text: 'The quarterly revenue was 42 million.' }],
            },
          },
          stopReason: 'end_turn',
          usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    },
  },
);

function prompt(filename: string): LanguageModelV4Prompt {
  return [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'What was the revenue? Answer in one short sentence.',
        },
        {
          type: 'file',
          data: {
            type: 'data',
            data: Buffer.from('The quarterly revenue was 42 million.').toString(
              'base64',
            ),
          },
          mediaType: 'text/plain',
          filename,
        },
      ],
    },
  ];
}

describe('Bedrock document filenames', () => {
  it.each(invalidFilenames)(
    'keeps the request usable for uploaded filename %j',
    async filename => {
      await expect(
        model.doGenerate({ prompt: prompt(filename) }),
      ).resolves.toMatchObject({
        content: [
          {
            type: 'text',
            text: 'The quarterly revenue was 42 million.',
          },
        ],
      });
    },
  );
});
