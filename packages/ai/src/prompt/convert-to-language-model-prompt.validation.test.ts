import { describe, expect, it } from 'vitest';
import { convertToLanguageModelPrompt } from './convert-to-language-model-prompt';
import { MissingToolResultError } from '../error/missing-tool-result-error';

describe('tool validation', () => {
  it('should pass validation for provider-executed tools (deferred results)', async () => {
    const result = await convertToLanguageModelPrompt({
      prompt: {
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_1',
                toolName: 'code_interpreter',
                input: { code: 'print("hello")' },
                providerExecuted: true,
              },
            ],
          },
        ],
      },
      supportedUrls: {},
      download: undefined,
    });

    expect(result).toBeDefined();
    const assistantMessage = result.find(m => m.role === 'assistant');
    if (!assistantMessage) throw new Error('Assistant message not found');

    // @ts-ignore
    const toolCall = assistantMessage.content.find(c => c.type === 'tool-call');
    expect(toolCall).toMatchObject({
      toolCallId: 'call_1',
      providerExecuted: true,
    });
  });

  it('should pass validation for tool-approval-response', async () => {
    const result = await convertToLanguageModelPrompt({
      prompt: {
        messages: [
          {
            role: 'assistant',
            content: [
              {
                type: 'tool-call',
                toolCallId: 'call_to_approve',
                toolName: 'dangerous_action',
                input: { action: 'delete_db' },
              },
              {
                type: 'tool-approval-request',
                toolCallId: 'call_to_approve',
                approvalId: 'approval_123',
                toolName: 'dangerous_action',
                input: { action: 'delete_db' },
              } as any,
            ],
          },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-approval-response',
                approvalId: 'approval_123',
                approved: true,
              } as any,
            ],
          },
        ],
      },
      supportedUrls: {},
      download: undefined,
    });

    expect(result).toBeDefined();
    const assistantMessage = result.find(m => m.role === 'assistant');
    if (!assistantMessage) throw new Error('Assistant message not found');

    // @ts-ignore
    expect(
      assistantMessage.content.some(
        c => c.type === 'tool-call' && c.toolCallId === 'call_to_approve',
      ),
    ).toBe(true);
  });

  it('should throw error for actual missing results', async () => {
    await expect(async () => {
      await convertToLanguageModelPrompt({
        prompt: {
          messages: [
            {
              role: 'assistant',
              content: [
                {
                  type: 'tool-call',
                  toolCallId: 'call_missing_result',
                  toolName: 'regular_tool',
                  input: {},
                },
              ],
            },
          ],
        },
        supportedUrls: {},
        download: undefined,
      });
    }).rejects.toThrow(MissingToolResultError);
  });
});
