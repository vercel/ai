import { convertToModelMessages } from 'ai';
import { describe, expect, test } from 'vitest';
import { collectHarnessAgentToolApprovalContinuations } from './harness-agent-tool-approval-continuation';

describe('collectHarnessAgentToolApprovalContinuations', () => {
  test.each([false, true])(
    'preserves mixed decisions from UI messages (providerExecuted: %s)',
    async providerExecuted => {
      const messages = await convertToModelMessages([
        {
          role: 'assistant',
          parts: [
            {
              type: 'tool-weather',
              toolCallId: 'call-1',
              state: 'approval-responded',
              input: { city: 'Paris' },
              providerExecuted,
              approval: { id: 'approval-1', approved: true },
            },
            {
              type: 'tool-weather',
              toolCallId: 'call-2',
              state: 'approval-responded',
              input: { city: 'Tokyo' },
              providerExecuted,
              approval: {
                id: 'approval-2',
                approved: false,
                reason: 'User denied the weather lookup.',
              },
            },
          ],
        },
      ]);

      expect(
        collectHarnessAgentToolApprovalContinuations({ messages }).map(
          ({ approvalId, approved, reason }) => ({
            approvalId,
            approved,
            reason,
          }),
        ),
      ).toMatchInlineSnapshot(`
        [
          {
            "approvalId": "approval-1",
            "approved": true,
            "reason": undefined,
          },
          {
            "approvalId": "approval-2",
            "approved": false,
            "reason": "User denied the weather lookup.",
          },
        ]
      `);
    },
  );

  test('preserves a denial when every approval is denied', async () => {
    const messages = await convertToModelMessages([
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool-weather',
            toolCallId: 'call-1',
            state: 'approval-responded',
            input: { city: 'Paris' },
            approval: { id: 'approval-1', approved: false },
          },
        ],
      },
    ]);

    expect(collectHarnessAgentToolApprovalContinuations({ messages }))
      .toMatchInlineSnapshot(`
      [
        {
          "approvalId": "approval-1",
          "approved": false,
          "providerExecuted": undefined,
          "reason": undefined,
          "type": "tool-approval-response",
        },
      ]
    `);
  });

  test('ignores approvals with completed tool results', async () => {
    const messages = await convertToModelMessages([
      {
        role: 'assistant',
        parts: [
          {
            type: 'tool-weather',
            toolCallId: 'call-1',
            state: 'output-available',
            input: { city: 'Paris' },
            output: { celsius: 12 },
            approval: { id: 'approval-1', approved: true },
          },
          {
            type: 'tool-weather',
            toolCallId: 'call-2',
            state: 'output-denied',
            input: { city: 'Tokyo' },
            approval: { id: 'approval-2', approved: false },
          },
        ],
      },
    ]);

    expect(
      collectHarnessAgentToolApprovalContinuations({ messages }),
    ).toMatchInlineSnapshot(`[]`);
  });
});
