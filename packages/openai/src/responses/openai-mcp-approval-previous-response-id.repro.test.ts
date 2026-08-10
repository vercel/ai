import type { LanguageModelV3Prompt } from '@ai-sdk/provider';
import { mockId } from '@ai-sdk/provider-utils/test';
import fs from 'node:fs';
import { expect, it } from 'vitest';
import { OpenAIResponsesLanguageModel } from './openai-responses-language-model';

const approvalId = 'mcpr_0c924a4f98a6100a006a79dec2eae481919925f9efe0c14866';

const prompt: LanguageModelV3Prompt = [
  {
    role: 'assistant',
    content: [
      {
        type: 'tool-call',
        toolCallId: 'dummy-tool-call-id',
        toolName: 'mcp.create_short_url',
        input: { url: 'https://ai-sdk.dev/' },
        providerExecuted: true,
      },
    ],
  },
  {
    role: 'tool',
    content: [
      {
        type: 'tool-approval-response',
        approvalId,
        approved: true,
      },
    ],
  },
];

const tools = [
  {
    type: 'provider' as const,
    id: 'openai.mcp' as const,
    name: 'mcp',
    args: {
      serverLabel: 'zip1',
      serverUrl: 'https://zip1.io/mcp',
      serverDescription: 'Link shortener',
      requireApproval: 'always' as const,
    },
  },
];

it('continues a stored MCP approval without duplicating the approval request item', async () => {
  const duplicateError = fs.readFileSync(
    'src/responses/__fixtures__/openai-mcp-approval-previous-response-duplicate-error.json',
    'utf8',
  );
  const successfulResponse = fs.readFileSync(
    'src/responses/__fixtures__/openai-mcp-tool-approval.2.json',
    'utf8',
  );

  const model = new OpenAIResponsesLanguageModel('gpt-5-mini', {
    provider: 'openai',
    url: ({ path }) => `https://api.openai.com/v1${path}`,
    headers: () => ({ Authorization: 'Bearer APIKEY' }),
    generateId: mockId(),
    fetch: async (_input, init) => {
      const requestBody = JSON.parse(String(init?.body)) as {
        input: Array<Record<string, unknown>>;
      };
      const hasDuplicateApprovalItems =
        requestBody.input.some(
          item => item.type === 'item_reference' && item.id === approvalId,
        ) &&
        requestBody.input.some(
          item =>
            item.type === 'mcp_approval_response' &&
            item.approval_request_id === approvalId,
        );

      return new Response(
        hasDuplicateApprovalItems ? duplicateError : successfulResponse,
        {
          status: hasDuplicateApprovalItems ? 400 : 200,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    },
  });

  const result = await model.doGenerate({
    prompt,
    tools,
    providerOptions: {
      openai: {
        previousResponseId:
          'resp_0c924a4f98a6100a006a79dec1111111111111111111111111',
        store: true,
      },
    },
  });

  expect(result.content.some(part => part.type === 'text')).toBe(true);
});
