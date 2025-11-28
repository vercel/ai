import { describe, expect, it } from 'vitest';
import { applyToolInputModifications } from './apply-tool-input-modifications';
import { CollectedToolApprovals } from './collect-tool-approvals';
import { ToolSet } from './tool-set';
import { tool } from '@ai-sdk/provider-utils';
import { z } from 'zod';

describe('applyToolInputModifications', () => {
  const testTools = {
    weather: tool({
      description: 'Get weather',
      inputSchema: z.object({ city: z.string() }),
      execute: async ({ city }) => `Weather in ${city}`,
      allowInputModification: true,
    }),
    calculator: tool({
      description: 'Calculate',
      inputSchema: z.object({ expression: z.string() }),
      execute: async ({ expression }) => `Result: ${expression}`,
    }),
    timer: tool({
      description: 'Set timer',
      inputSchema: z.object({ duration: z.number() }),
      execute: async ({ duration }) => `Timer set for ${duration}s`,
    }),
  } satisfies ToolSet;

  it('should return tool calls with original input when no modifiedInput provided', () => {
    const approvals: CollectedToolApprovals<typeof testTools>[] = [
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
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
        },
      },
    ];

    const result = applyToolInputModifications({
      approvals,
      tools: testTools,
    });

    expect(result).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'London' },
      },
    ]);
  });

  it('should return tool calls with modified input when modifiedInput provided', () => {
    const approvals: CollectedToolApprovals<typeof testTools>[] = [
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
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
          modifiedInput: { city: 'Paris' },
        },
      },
    ];

    const result = applyToolInputModifications({
      approvals,
      tools: testTools,
    });

    expect(result).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Paris' },
      },
    ]);
  });

  it('should throw error when modifiedInput provided but allowInputModification is false', () => {
    const approvals: CollectedToolApprovals<typeof testTools>[] = [
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
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
          modifiedInput: { expression: '2+2' },
        },
      },
    ];

    expect(() =>
      applyToolInputModifications({
        approvals,
        tools: testTools,
      }),
    ).toThrowError(
      "Tool 'calculator' does not allow input modification. Set allowInputModification: true to enable this feature.",
    );
  });

  it('should throw error when modifiedInput provided but allowInputModification is undefined', () => {
    const approvals: CollectedToolApprovals<typeof testTools>[] = [
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
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
          modifiedInput: { duration: 120 },
        },
      },
    ];

    expect(() =>
      applyToolInputModifications({
        approvals,
        tools: testTools,
      }),
    ).toThrowError(
      "Tool 'timer' does not allow input modification. Set allowInputModification: true to enable this feature.",
    );
  });

  it('should handle multiple approvals with mixed modified and original inputs', () => {
    const approvals: CollectedToolApprovals<typeof testTools>[] = [
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
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
          modifiedInput: { city: 'Paris' },
        },
      },
      {
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-2',
          toolName: 'weather',
          input: { city: 'Berlin' },
        },
        approvalRequest: {
          type: 'tool-approval-request',
          approvalId: 'approval-2',
          toolCallId: 'call-2',
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-2',
          approved: true,
          // No modifiedInput
        },
      },
    ];

    const result = applyToolInputModifications({
      approvals,
      tools: testTools,
    });

    expect(result).toEqual([
      {
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'weather',
        input: { city: 'Paris' },
      },
      {
        type: 'tool-call',
        toolCallId: 'call-2',
        toolName: 'weather',
        input: { city: 'Berlin' },
      },
    ]);
  });

  it('should throw error when tools is undefined but modifiedInput is provided', () => {
    const approvals: CollectedToolApprovals<ToolSet>[] = [
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
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId: 'approval-1',
          approved: true,
          modifiedInput: { city: 'Paris' },
        },
      },
    ];

    expect(() =>
      applyToolInputModifications({
        approvals,
        tools: undefined,
      }),
    ).toThrowError(
      "Tool 'weather' does not allow input modification. Set allowInputModification: true to enable this feature.",
    );
  });
});
