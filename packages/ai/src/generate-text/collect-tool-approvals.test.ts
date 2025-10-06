import { describe, expect, it } from 'vitest';
import { collectToolApprovals } from './collect-tool-approvals';

describe('collectToolApprovals', () => {
  it('should not return any tool approvals when the last message is not a tool message', () => {
    const result = collectToolApprovals({
      messages: [{ role: 'user', content: 'Hello, world!' }],
    });

    expect(result).toMatchInlineSnapshot(`[]`);
  });

  it('should ignore approval request without response', () => {
    const result = collectToolApprovals({
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: { value: 'test-input' },
            },
            {
              type: 'tool-approval-request',
              approvalId: 'approval-id-1',
              toolCallId: 'call-1',
            },
          ],
        },
        {
          role: 'tool',
          content: [],
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`[]`);
  });

  it('should return approved approval with approved response', () => {
    const result = collectToolApprovals({
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: { value: 'test-input' },
            },
            {
              type: 'tool-approval-request',
              approvalId: 'approval-id-1',
              toolCallId: 'call-1',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-approval-response',
              approvalId: 'approval-id-1',
              approved: true,
            },
          ],
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "approvalRequest": {
            "approvalId": "approval-id-1",
            "toolCallId": "call-1",
            "type": "tool-approval-request",
          },
          "approvalResponse": {
            "approvalId": "approval-id-1",
            "approved": true,
            "type": "tool-approval-response",
          },
          "state": "approved",
          "toolCall": {
            "input": {
              "value": "test-input",
            },
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-call",
          },
          "toolResult": undefined,
        },
      ]
    `);
  });

  it('should return processed approval with approved response and tool result', () => {
    const result = collectToolApprovals({
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: { value: 'test-input' },
            },
            {
              type: 'tool-approval-request',
              approvalId: 'approval-id-1',
              toolCallId: 'call-1',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-approval-response',
              approvalId: 'approval-id-1',
              approved: true,
            },
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'tool1',
              output: { type: 'text', value: 'test-output' },
            },
          ],
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "approvalRequest": {
            "approvalId": "approval-id-1",
            "toolCallId": "call-1",
            "type": "tool-approval-request",
          },
          "approvalResponse": {
            "approvalId": "approval-id-1",
            "approved": true,
            "type": "tool-approval-response",
          },
          "state": "processed",
          "toolCall": {
            "input": {
              "value": "test-input",
            },
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-call",
          },
          "toolResult": {
            "output": {
              "type": "text",
              "value": "test-output",
            },
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-result",
          },
        },
      ]
    `);
  });

  it('should return denied approval with denied response', () => {
    const result = collectToolApprovals({
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: { value: 'test-input' },
            },
            {
              type: 'tool-approval-request',
              approvalId: 'approval-id-1',
              toolCallId: 'call-1',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-approval-response',
              approvalId: 'approval-id-1',
              approved: false,
              reason: 'test-reason',
            },
          ],
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "approvalRequest": {
            "approvalId": "approval-id-1",
            "toolCallId": "call-1",
            "type": "tool-approval-request",
          },
          "approvalResponse": {
            "approvalId": "approval-id-1",
            "approved": false,
            "reason": "test-reason",
            "type": "tool-approval-response",
          },
          "state": "denied",
          "toolCall": {
            "input": {
              "value": "test-input",
            },
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-call",
          },
          "toolResult": undefined,
        },
      ]
    `);
  });

  it('should return processed approval with denied response and tool result', () => {
    const result = collectToolApprovals({
      messages: [
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'call-1',
              toolName: 'tool1',
              input: { value: 'test-input' },
            },
            {
              type: 'tool-approval-request',
              approvalId: 'approval-id-1',
              toolCallId: 'call-1',
            },
          ],
        },
        {
          role: 'tool',
          content: [
            {
              type: 'tool-approval-response',
              approvalId: 'approval-id-1',
              approved: false,
              reason: 'test-reason',
            },
            {
              type: 'tool-result',
              toolCallId: 'call-1',
              toolName: 'tool1',
              output: { type: 'execution-denied', reason: 'test-reason' },
            },
          ],
        },
      ],
    });

    expect(result).toMatchInlineSnapshot(`
      [
        {
          "approvalRequest": {
            "approvalId": "approval-id-1",
            "toolCallId": "call-1",
            "type": "tool-approval-request",
          },
          "approvalResponse": {
            "approvalId": "approval-id-1",
            "approved": false,
            "reason": "test-reason",
            "type": "tool-approval-response",
          },
          "state": "processed",
          "toolCall": {
            "input": {
              "value": "test-input",
            },
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-call",
          },
          "toolResult": {
            "output": {
              "reason": "test-reason",
              "type": "execution-denied",
            },
            "toolCallId": "call-1",
            "toolName": "tool1",
            "type": "tool-result",
          },
        },
      ]
    `);
  });
});
