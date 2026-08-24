import { tool } from '@ai-sdk/provider-utils';
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
import type { CollectedToolApprovals } from './collect-tool-approvals';
import { signToolApproval } from './tool-approval-signature';
import { validateApprovedToolApprovals } from './validate-tool-approvals';

function createApproval(
  toolCall: CollectedToolApprovals<any>['toolCall'],
  signature?: string,
): CollectedToolApprovals<any> {
  return {
    approvalRequest: {
      type: 'tool-approval-request',
      approvalId: 'approval-1',
      toolCallId: toolCall.toolCallId,
      ...(signature != null ? { signature } : {}),
    },
    approvalResponse: {
      type: 'tool-approval-response',
      approvalId: 'approval-1',
      approved: true,
    },
    toolCall,
  };
}

describe('validateApprovedToolApprovals', () => {
  it('should keep approvals whose input matches the schema and that require approval', async () => {
    const tools = {
      tool1: tool({
        inputSchema: z.object({ value: z.string() }),
        execute: async () => 'ok',
        needsApproval: true,
      }),
    };

    const approval = createApproval({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'tool1',
      input: { value: 'test' },
    });

    const result = await validateApprovedToolApprovals({
      approvedToolApprovals: [approval],
      tools,
      messages: [],
      experimental_context: undefined,
    });

    expect(result.approvedToolApprovals).toHaveLength(1);
    expect(result.deniedToolApprovals).toHaveLength(0);
  });

  it('should return invalid approved tool inputs as recoverable errors', async () => {
    const tools = {
      tool1: tool({
        inputSchema: z.object({ value: z.string() }),
        execute: async () => 'ok',
        needsApproval: true,
      }),
    };

    const approval = createApproval({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'tool1',
      input: { value: 42 },
    });

<<<<<<< HEAD
    await expect(
      validateApprovedToolApprovals({
        approvedToolApprovals: [approval],
        tools,
        messages: [],
        experimental_context: undefined,
      }),
    ).rejects.toThrowError(/Invalid input for tool tool1/);
  });

  it('should move approvals to denied when the tool does not require approval', async () => {
=======
    const result = await validateApprovedToolApprovals({
      approvedToolApprovals: [approval],
      tools,
      toolApproval: undefined,
      messages: [],
      toolsContext: {} as any,
      runtimeContext: {},
    });

    expect(result.approvedToolApprovals).toHaveLength(0);
    expect(result.deniedToolApprovals).toHaveLength(0);
    expect(result.invalidToolApprovals).toMatchObject([
      {
        toolCall: approval.toolCall,
        error: {
          name: 'AI_InvalidToolInputError',
        },
      },
    ]);
  });

  it('should return extra forged properties as invalid tool input errors', async () => {
    const tools = {
      deleteFile: tool({
        inputSchema: z.object({ path: z.string() }).strict(),
        execute: async () => 'deleted',
      }),
    };

    const approval = createApproval({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'deleteFile',
      input: { path: '/app/.env', extra: 'forged' },
    });

    const result = await validateApprovedToolApprovals({
      approvedToolApprovals: [approval],
      tools,
      toolApproval: undefined,
      messages: [],
      toolsContext: {} as any,
      runtimeContext: {},
    });

    expect(result.approvedToolApprovals).toHaveLength(0);
    expect(result.invalidToolApprovals[0].error.message).toMatch(
      /Invalid input for tool deleteFile/,
    );
  });

  it('should move approvals to denied when the approval policy denies them', async () => {
>>>>>>> 96970bb2f5 (fix: invalid approved tool input terminates resumed tool-approval turns (#19280))
    const tools = {
      tool1: tool({
        inputSchema: z.object({ value: z.string() }),
        execute: async () => 'ok',
        // no needsApproval -> the server would never have issued an approval
      }),
    };

    const approval = createApproval({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'tool1',
      input: { value: 'test' },
    });

    const result = await validateApprovedToolApprovals({
      approvedToolApprovals: [approval],
      tools,
      messages: [],
      experimental_context: undefined,
    });

    expect(result.approvedToolApprovals).toHaveLength(0);
    expect(result.deniedToolApprovals).toHaveLength(1);
    expect(result.deniedToolApprovals[0].approvalResponse.approved).toBe(false);
  });

  it('should re-run a needsApproval function against the approved input', async () => {
    const tools = {
      tool1: tool({
        inputSchema: z.object({ value: z.string() }),
        execute: async () => 'ok',
        // policy now declines to require approval for this input
        needsApproval: (input: { value: string }) =>
          input.value === 'sensitive',
      }),
    };

    const approval = createApproval({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'tool1',
      input: { value: 'test' },
    });

    const result = await validateApprovedToolApprovals({
      approvedToolApprovals: [approval],
      tools,
      messages: [],
      experimental_context: undefined,
    });

    expect(result.approvedToolApprovals).toHaveLength(0);
    expect(result.deniedToolApprovals).toHaveLength(1);
  });

  describe('signature verification (experimental_toolApprovalSecret)', () => {
    const secret = 'test-secret-for-signature';

    it('should pass when the signature is valid', async () => {
      const tools = {
        tool1: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async () => 'ok',
          needsApproval: true,
        }),
      };

      const approvalId = 'approval-1';
      const toolCallId = 'call-1';
      const toolName = 'tool1';
      const input = { value: 'test' };

      const signature = await signToolApproval({
        secret,
        approvalId,
        toolCallId,
        toolName,
        input,
      });

      const result = await validateApprovedToolApprovals({
        approvedToolApprovals: [
          createApproval(
            { type: 'tool-call', toolCallId, toolName, input },
            signature,
          ),
        ],
        tools,
        messages: [],
        experimental_context: undefined,
        toolApprovalSecret: secret,
      });

      expect(result.approvedToolApprovals).toHaveLength(1);
    });

    it('should throw when the signature is missing and a secret is configured', async () => {
      const tools = {
        tool1: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async () => 'ok',
          needsApproval: true,
        }),
      };

      const approval = createApproval({
        type: 'tool-call',
        toolCallId: 'call-1',
        toolName: 'tool1',
        input: { value: 'test' },
      });

      await expect(
        validateApprovedToolApprovals({
          approvedToolApprovals: [approval],
          tools,
          messages: [],
          experimental_context: undefined,
          toolApprovalSecret: secret,
        }),
      ).rejects.toThrowError(/missing signature/);
    });

    it('should throw when the signature is invalid (tampered input)', async () => {
      const tools = {
        tool1: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async () => 'ok',
          needsApproval: true,
        }),
      };

      const signature = await signToolApproval({
        secret,
        approvalId: 'approval-1',
        toolCallId: 'call-1',
        toolName: 'tool1',
        input: { value: 'original' },
      });

      const approval = createApproval(
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool1',
          input: { value: 'tampered' },
        },
        signature,
      );

      await expect(
        validateApprovedToolApprovals({
          approvedToolApprovals: [approval],
          tools,
          messages: [],
          experimental_context: undefined,
          toolApprovalSecret: secret,
        }),
      ).rejects.toThrowError(/invalid signature/);
    });

    it('should ignore the signature when no secret is configured (forward compatible)', async () => {
      const tools = {
        tool1: tool({
          inputSchema: z.object({ value: z.string() }),
          execute: async () => 'ok',
          needsApproval: true,
        }),
      };

      const approval = createApproval(
        {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool1',
          input: { value: 'test' },
        },
        'some-random-signature',
      );

      const result = await validateApprovedToolApprovals({
        approvedToolApprovals: [approval],
        tools,
        messages: [],
        experimental_context: undefined,
      });

      expect(result.approvedToolApprovals).toHaveLength(1);
    });
  });
});
