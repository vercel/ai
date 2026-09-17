import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import fs from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { createOpenAI } from '../openai-provider';

describe('OpenAI Responses tool-result file references', () => {
  it('sends provider file IDs in function call outputs', async () => {
    const response = JSON.parse(
      fs.readFileSync(
        'src/responses/__fixtures__/openai-function-tool-output-image-reference.1.json',
        'utf8',
      ),
    );
    let requestBody: unknown;
    const fetch = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        requestBody = JSON.parse(String(init?.body));
        return Response.json(response);
      },
    );
    const model = createOpenAI({
      apiKey: 'synthetic-test-key',
      fetch,
    }).responses('gpt-4.1');

    const prompt: LanguageModelV3Prompt = [
      {
        role: 'assistant',
        content: [
          {
            type: 'tool-call',
            toolCallId: 'pdf-reference',
            toolName: 'lookup',
            input: {},
          },
          {
            type: 'tool-call',
            toolCallId: 'image-reference',
            toolName: 'lookup',
            input: {},
          },
        ],
      },
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'pdf-reference',
            toolName: 'lookup',
            output: {
              type: 'content',
              value: [
                {
                  type: 'file-id',
                  fileId: { openai: 'file-synthetic-pdf' },
                },
              ],
            },
          },
          {
            type: 'tool-result',
            toolCallId: 'image-reference',
            toolName: 'lookup',
            output: {
              type: 'content',
              value: [
                {
                  type: 'image-file-id',
                  fileId: { openai: 'file-synthetic-image' },
                },
              ],
            },
          },
        ],
      },
    ];

    await model.doGenerate({ prompt });

    const body = requestBody as {
      input: Array<{ type?: string }>;
    };
    const outputs = body.input.filter(
      (item: { type?: string }) => item.type === 'function_call_output',
    );

    expect(outputs).toEqual([
      {
        type: 'function_call_output',
        call_id: 'pdf-reference',
        output: [
          {
            type: 'input_file',
            file_id: 'file-synthetic-pdf',
          },
        ],
      },
      {
        type: 'function_call_output',
        call_id: 'image-reference',
        output: [
          {
            type: 'input_image',
            file_id: 'file-synthetic-image',
          },
        ],
      },
    ]);
  });
});
