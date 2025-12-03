import { describe, expect, it } from 'vitest';
import { validateAndApplyToolInputOverrides } from './validate-and-apply-tool-input-overrides';
import { CollectedToolApprovals } from './collect-tool-approvals';

describe('validateAndApplyToolInputOverrides', () => {
  it('should return valid tool calls when no override is provided', () => {
    const approvals: CollectedToolApprovals<any>[] = [
      {
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'weather',
          input: { city: 'London' },
        },
        approvalRequest: {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCallId: 'call-1',
          allowsInputEditing: true,
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
        },
      },
    ];

    const result = validateAndApplyToolInputOverrides({ approvals });

    expect(result.validToolCalls).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'London' },
      },
    ]);
    expect(result.invalidToolErrors).toEqual([]);
  });

  it('should return valid tool calls when override is provided and allowed', () => {
    const approvals: CollectedToolApprovals<any>[] = [
      {
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'weather',
          input: { city: 'London' },
        },
        approvalRequest: {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCallId: 'call-1',
          allowsInputEditing: true,
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
          override: { input: { city: 'Paris' } },
        },
      },
    ];

    const result = validateAndApplyToolInputOverrides({ approvals });

    expect(result.validToolCalls).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Paris' },
      },
    ]);
    expect(result.invalidToolErrors).toEqual([]);
  });

  it('should return invalid tool error when override is provided but not allowed', () => {
    const approvals: CollectedToolApprovals<any>[] = [
      {
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'calculator',
          input: { expression: '1+1' },
        },
        approvalRequest: {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCallId: 'call-1',
          allowsInputEditing: false,
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
          override: { input: { expression: '2+2' } },
        },
      },
    ];

    const result = validateAndApplyToolInputOverrides({ approvals });

    expect(result.validToolCalls).toEqual([]);
    expect(result.invalidToolErrors).toMatchInlineSnapshot(`
      [
        {
          "dynamic": true,
          "error": "Tool 'calculator' does not allow input modification. Set allowsInputEditing: true to enable this feature.",
          "input": {
            "expression": "2+2",
          },
          "toolCallId": "call-1",
          "toolName": "calculator",
          "type": "tool-error",
        },
      ]
    `);
  });

  it('should return invalid tool error when override is provided but inputEditable is undefined', () => {
    const approvals: CollectedToolApprovals<any>[] = [
      {
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'timer',
          input: { duration: 60 },
        },
        approvalRequest: {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCallId: 'call-1',
          allowsInputEditing: undefined
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
          override: { input: { duration: 120 } },
        },
      },
    ];

    const result = validateAndApplyToolInputOverrides({ approvals });

    expect(result.validToolCalls).toEqual([]);
    expect(result.invalidToolErrors).toMatchInlineSnapshot(`
      [
        {
          "dynamic": true,
          "error": "Tool 'timer' does not allow input modification. Set allowsInputEditing: true to enable this feature.",
          "input": {
            "duration": 120,
          },
          "toolCallId": "call-1",
          "toolName": "timer",
          "type": "tool-error",
        },
      ]
    `);
  });

  it('should handle multiple approvals with mixed valid and invalid', () => {
    const approvals: CollectedToolApprovals<any>[] = [
      {
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'weather',
          input: { city: 'London' },
        },
        approvalRequest: {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCallId: 'call-1',
          allowsInputEditing: true,
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
          override: { input: { city: 'Paris' } },
        },
      },
      {
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-2',
          toolName: 'calculator',
          input: { expression: '1+1' },
        },
        approvalRequest: {
          type: 'tool-approval-request',
          approvalId: 'approval-2',
          toolCallId: 'call-2',
          allowsInputEditing: false,
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-2',
          approved: true,
          override: { input: { expression: '2+2' } },
        },
      },
      {
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-3',
          toolName: 'weather',
          input: { city: 'Berlin' },
        },
        approvalRequest: {
          type: 'tool-approval-request',
          approvalId: 'approval-3',
          toolCallId: 'call-3',
          allowsInputEditing: true,
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-3',
          approved: true,
          // No override
        },
      },
    ];

    const result = validateAndApplyToolInputOverrides({ approvals });

    expect(result.validToolCalls).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Paris' },
      },
      {
        type: 'tool-call',
        toolCallId: 'call-3',
        toolName: 'weather',
        input: { city: 'Berlin' },
      },
    ]);
    expect(result.invalidToolErrors).toHaveLength(1);
    expect(result.invalidToolErrors[0].toolCallId).toBe('call-2');
    expect(result.invalidToolErrors[0].toolName).toBe('calculator');
  });

  it('should handle empty approvals array', () => {
    const result = validateAndApplyToolInputOverrides({ approvals: [] });

    expect(result.validToolCalls).toEqual([]);
    expect(result.invalidToolErrors).toEqual([]);
  });

  it('should preserve tool call properties when valid', () => {
    const approvals: CollectedToolApprovals<any>[] = [
      {
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'weather',
          input: { city: 'London' },
          providerExecuted: true,
          providerMetadata: { test: 'data' } as any,
          dynamic: true,
        },
        approvalRequest: {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCallId: 'call-1',
          allowsInputEditing: true,
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
          override: { input: { city: 'Paris' } },
        },
      },
    ];

    const result = validateAndApplyToolInputOverrides({ approvals });

    expect(result.validToolCalls[0]).toMatchObject({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'weather',
      input: { city: 'Paris' },
      providerExecuted: true,
      providerMetadata: { test: 'data' },
      dynamic: true,
    });
  });

  it('should use original input when override is not provided', () => {
    const approvals: CollectedToolApprovals<any>[] = [
      {
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'weather',
          input: { city: 'London' },
        },
        approvalRequest: {
          type: 'tool-approval-request',
          approvalId: 'approval-1',
          toolCallId: 'call-1',
          allowsInputEditing: true,
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
          // No override
        },
      },
    ];

    const result = validateAndApplyToolInputOverrides({ approvals });

    expect(result.validToolCalls[0].input).toEqual({ city: 'London' });
  });
});
