import fs from 'node:fs';
import type { ToolNameMapping } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { convertToOpenAIResponsesInput } from './convert-to-openai-responses-input';

const approvalId = 'mcpr_022444f7f0878ab8006a766d20b08881a290edfa9c9943f2ae';
const toolNameMapping: ToolNameMapping = {
  toProviderToolName: toolName => toolName,
  toCustomToolName: toolName => toolName,
};

describe('issue #18605', () => {
  it('does not replay a stored MCP approval request with its approval response', async () => {
    const recordedError = JSON.parse(
      fs.readFileSync(
        new URL(
          './__fixtures__/openai-mcp-approval-previous-response-duplicate-error.json',
          import.meta.url,
        ),
        'utf8',
      ),
    ) as { error: { message: string } };

    const result = await convertToOpenAIResponsesInput({
      prompt: [
        {
          role: 'tool',
          content: [
            {
              type: 'tool-approval-response',
              approvalId,
              approved: false,
            },
          ],
        },
      ],
      toolNameMapping,
      systemMessageMode: 'system',
      providerOptionsName: 'openai',
      store: true,
      hasPreviousResponseId: true,
    });

    const hasApprovalResponse = result.input.some(
      item =>
        'type' in item &&
        item.type === 'mcp_approval_response' &&
        item.approval_request_id === approvalId,
    );
    const hasDuplicateReference = result.input.some(
      item =>
        'type' in item &&
        item.type === 'item_reference' &&
        item.id === approvalId,
    );

    expect(hasApprovalResponse).toBe(true);
    if (hasDuplicateReference) {
      throw new Error(recordedError.error.message);
    }
  });
});
