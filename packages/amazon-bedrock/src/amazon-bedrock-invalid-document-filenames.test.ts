import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { BedrockChatLanguageModel } from './bedrock-chat-language-model';

type RecordedFixture = {
  modelId: string;
  cases: Array<{
    filename: string;
    submittedName: string;
    status: number;
    body: { message: string };
  }>;
};

const fixture = JSON.parse(
  readFileSync(
    'src/__fixtures__/amazon-bedrock-invalid-document-filenames.json',
    'utf8',
  ),
) as RecordedFixture;

const rejectedNames = new Map(
  fixture.cases.map(testCase => [testCase.submittedName, testCase]),
);

function findDocumentName(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const name = findDocumentName(item);
      if (name !== undefined) {
        return name;
      }
    }
  } else if (value != null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (
      record.document != null &&
      typeof record.document === 'object' &&
      typeof (record.document as Record<string, unknown>).name === 'string'
    ) {
      return (record.document as Record<string, string>).name;
    }

    for (const item of Object.values(record)) {
      const name = findDocumentName(item);
      if (name !== undefined) {
        return name;
      }
    }
  }

  return undefined;
}

const model = new BedrockChatLanguageModel(fixture.modelId, {
  baseUrl: () => 'https://bedrock-runtime.us-east-1.amazonaws.com',
  headers: {},
  generateId: () => 'test-id',
  fetch: async (_input, init) => {
    const requestBody = JSON.parse(String(init?.body));
    const submittedName = findDocumentName(requestBody);
    const rejection =
      submittedName === undefined
        ? undefined
        : rejectedNames.get(submittedName);

    if (rejection) {
      return new Response(JSON.stringify(rejection.body), {
        status: rejection.status,
        headers: {
          'content-type': 'application/json',
          'x-amzn-errortype':
            'ValidationException:http://internal.amazon.com/coral/com.amazon.bedrock/',
        },
      });
    }

    return Response.json({
      output: {
        message: {
          role: 'assistant',
          content: [{ text: 'The quarterly revenue was 42 million.' }],
        },
      },
      stopReason: 'end_turn',
      usage: {
        inputTokens: 20,
        outputTokens: 9,
        totalTokens: 29,
      },
    });
  },
});

describe('invalid Bedrock document filenames', () => {
  it.each(fixture.cases)(
    'keeps the uploaded document usable for $filename',
    async ({ filename }) => {
      const prompt: LanguageModelV3Prompt = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: 'What was the revenue? Answer in one short sentence.',
            },
            {
              type: 'file',
              data: new TextEncoder().encode(
                'The quarterly revenue was 42 million.',
              ),
              mediaType: 'text/plain',
              filename,
            },
          ],
        },
      ];

      const result = await model.doGenerate({ prompt });

      expect(result.content).toContainEqual({
        type: 'text',
        text: 'The quarterly revenue was 42 million.',
      });
    },
  );
});
