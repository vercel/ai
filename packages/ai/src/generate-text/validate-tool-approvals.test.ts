import { tool } from '@ai-sdk/provider-utils';
<<<<<<< HEAD
import { describe, expect, it } from 'vitest';
import { z } from 'zod/v4';
=======
import { describe, expect, it, vi } from 'vitest';
import { z as z3 } from 'zod/v3';
import { z as z4 } from 'zod/v4';
>>>>>>> a4b0940b75 (fix: manual tool approvals reject or mutate transformed inputs across model and UI continuations (#21130))
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
        inputSchema: z4.object({ value: z4.string() }),
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
        inputSchema: z4.object({ value: z4.string() }),
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

    const result = await validateApprovedToolApprovals({
      approvedToolApprovals: [approval],
      tools,
      messages: [],
      experimental_context: undefined,
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
        inputSchema: z4.object({ path: z4.string() }).strict(),
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
      messages: [],
      experimental_context: undefined,
    });

    expect(result.approvedToolApprovals).toHaveLength(0);
    expect(result.invalidToolApprovals[0].error.message).toMatch(
      /Invalid input for tool deleteFile/,
    );
  });

<<<<<<< HEAD
  it('should move approvals to denied when the tool does not require approval', async () => {
=======
  it('should keep approvals whose schema input transforms to the approved input', async () => {
    const tools = {
      tool1: tool({
        inputSchema: z4.object({
          count: z4.string().transform(Number),
        }),
        execute: async () => 'ok',
      }),
    };

    const approval = createApproval({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'tool1',
      input: { count: 3 },
    });
    approval.approvalRequest.inputSchemaInput = { count: '3' };

    const result = await validateApprovedToolApprovals({
      approvedToolApprovals: [approval],
      tools,
      toolApproval: undefined,
      messages: [],
      toolsContext: {} as any,
      runtimeContext: {},
    });

    expect(result.approvedToolApprovals).toHaveLength(1);
    expect(result.invalidToolApprovals).toHaveLength(0);
  });

  it('should reject approvals when missing schema input would change the approved input', async () => {
    const tools = {
      tool1: tool({
        inputSchema: z4
          .object({ raw: z4.string() })
          .transform(({ raw }) => ({ safe: Number(raw) })),
        execute: async () => 'ok',
      }),
    };

    const approval = createApproval({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'tool1',
      input: { raw: '999' },
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
    expect(result.invalidToolApprovals).toMatchObject([
      {
        toolCall: approval.toolCall,
        error: {
          name: 'AI_InvalidToolInputError',
          message: expect.stringMatching(
            /does not match the validated schema output/,
          ),
        },
      },
    ]);
    expect(approval.toolCall.input).toEqual({ raw: '999' });
  });

  it('should keep approvals whose schema input reshapes to the approved input', async () => {
    const tools = {
      tool1: tool({
        inputSchema: z3.object({ raw: z3.string() }).transform(({ raw }) => ({
          count: Number(raw),
        })),
        execute: async () => 'ok',
      }),
    };

    const approval = createApproval({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'tool1',
      input: { count: 3 },
    });
    approval.approvalRequest.inputSchemaInput = { raw: '3' };

    const result = await validateApprovedToolApprovals({
      approvedToolApprovals: [approval],
      tools,
      toolApproval: undefined,
      messages: [],
      toolsContext: {} as any,
      runtimeContext: {},
    });

    expect(result.approvedToolApprovals).toHaveLength(1);
    expect(result.invalidToolApprovals).toHaveLength(0);
  });

  it('should reapply input refinement before comparing the approved input', async () => {
    const tools = {
      tool1: tool({
        inputSchema: z4.object({ value: z4.string() }),
        execute: async () => 'ok',
      }),
    };

    const approval = createApproval({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'tool1',
      input: { value: 'trimmed' },
    });
    approval.approvalRequest.inputSchemaInput = { value: ' trimmed ' };

    const result = await validateApprovedToolApprovals({
      approvedToolApprovals: [approval],
      tools,
      toolApproval: undefined,
      messages: [],
      toolsContext: {} as any,
      runtimeContext: {},
      refineToolInput: {
        tool1: input => ({
          value: (input as { value: string }).value.trim(),
        }),
      },
    });

    expect(result.approvedToolApprovals).toHaveLength(1);
    expect(result.invalidToolApprovals).toHaveLength(0);
  });

  it('should reject approvals whose transformed schema output was changed', async () => {
    const tools = {
      tool1: tool({
        inputSchema: z4.object({
          count: z4.string().transform(Number),
        }),
        execute: async () => 'ok',
      }),
    };

    const approval = createApproval({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'tool1',
      input: { count: 4 },
    });
    approval.approvalRequest.inputSchemaInput = { count: '3' };

    const result = await validateApprovedToolApprovals({
      approvedToolApprovals: [approval],
      tools,
      toolApproval: undefined,
      messages: [],
      toolsContext: {} as any,
      runtimeContext: {},
    });

    expect(result.approvedToolApprovals).toHaveLength(0);
    expect(result.invalidToolApprovals).toMatchObject([
      {
        toolCall: approval.toolCall,
        error: {
          name: 'AI_InvalidToolInputError',
          message: expect.stringMatching(
            /does not match the validated schema output/,
          ),
        },
      },
    ]);
  });

  it('should move approvals to denied when the approval policy denies them', async () => {
>>>>>>> a4b0940b75 (fix: manual tool approvals reject or mutate transformed inputs across model and UI continuations (#21130))
    const tools = {
      tool1: tool({
        inputSchema: z4.object({ value: z4.string() }),
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
        inputSchema: z4.object({ value: z4.string() }),
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

<<<<<<< HEAD
=======
    expect(result.deniedToolApprovals).toHaveLength(1);
    expect(result.deniedToolApprovals[0].approvalResponse.reason).toBe(
      'policy changed',
    );
    expect(result.deniedToolApprovals[0].approvalResponse.approved).toBe(false);
  });

  it('should re-run a function-based approval policy on the approved input', async () => {
    const approvalPolicy = vi.fn().mockResolvedValue('denied');
    const tools = {
      tool1: tool({
        inputSchema: z4.object({ value: z4.string() }),
        execute: async () => 'ok',
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
      // per-tool approval policy re-evaluated against the approved input
      toolApproval: { tool1: approvalPolicy },
      messages: [],
      toolsContext: {} as any,
      runtimeContext: {},
    });

    expect(approvalPolicy).toHaveBeenCalledWith(
      { value: 'test' },
      expect.objectContaining({ toolCallId: 'call-1' }),
    );
>>>>>>> a4b0940b75 (fix: manual tool approvals reject or mutate transformed inputs across model and UI continuations (#21130))
    expect(result.approvedToolApprovals).toHaveLength(0);
    expect(result.deniedToolApprovals).toHaveLength(1);
  });

<<<<<<< HEAD
=======
  it('should pass through approvals for tools without an execute function (not validated)', async () => {
    const tools = {
      tool1: tool({
        inputSchema: z4.object({ value: z4.string() }),
        // no execute -> client-side tool, not run on the server
      }),
    };

    const approval = createApproval({
      type: 'tool-call',
      toolCallId: 'call-1',
      toolName: 'tool1',
      input: { value: 42 },
    });

    const result = await validateApprovedToolApprovals({
      approvedToolApprovals: [approval],
      tools,
      toolApproval: undefined,
      messages: [],
      toolsContext: {} as any,
      runtimeContext: {},
    });

    expect(result.approvedToolApprovals).toHaveLength(1);
    expect(result.deniedToolApprovals).toHaveLength(0);
  });

>>>>>>> a4b0940b75 (fix: manual tool approvals reject or mutate transformed inputs across model and UI continuations (#21130))
  describe('signature verification (experimental_toolApprovalSecret)', () => {
    const secret = 'test-secret-for-signature';

    it.each([true, false])(
      'should preserve signed transformed input or reject it when schema input is missing (schema input: %s)',
      async hasInputSchemaInput => {
        const tools = {
          tool1: tool({
            inputSchema: z4.object({
              count: z4.number().transform(count => count + 1),
            }),
            execute: async () => 'ok',
          }),
        };
        const approval = createApproval({
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'tool1',
          input: { count: 2 },
        });
        approval.approvalRequest.signature = await signToolApproval({
          secret,
          approvalId: approval.approvalRequest.approvalId,
          ...approval.toolCall,
        });
        if (hasInputSchemaInput) {
          approval.approvalRequest.inputSchemaInput = { count: 1 };
        }
        const approvalPolicy = vi.fn().mockResolvedValue('user-approval');

        const result = await validateApprovedToolApprovals({
          approvedToolApprovals: [approval],
          tools,
          toolApproval: { tool1: approvalPolicy },
          messages: [],
          toolsContext: {},
          runtimeContext: {},
          toolApprovalSecret: secret,
        });

        expect(approval.toolCall.input).toEqual({ count: 2 });
        if (hasInputSchemaInput) {
          expect(result.approvedToolApprovals).toEqual([approval]);
          expect(result.approvedToolApprovals[0]).toBe(approval);
          expect(result.invalidToolApprovals).toHaveLength(0);
          expect(approvalPolicy).toHaveBeenCalledWith(
            { count: 2 },
            expect.anything(),
          );
        } else {
          expect(result.approvedToolApprovals).toHaveLength(0);
          expect(result.invalidToolApprovals).toHaveLength(1);
          expect(result.invalidToolApprovals[0].error.message).toMatch(
            /does not match the validated schema output/,
          );
          expect(approvalPolicy).not.toHaveBeenCalled();
        }
      },
    );

    it('should pass when the signature is valid', async () => {
      const tools = {
        tool1: tool({
          inputSchema: z4.object({ value: z4.string() }),
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

<<<<<<< HEAD
    it('should throw when the signature is missing and a secret is configured', async () => {
=======
    it('should not transform a signed input after verification when schema input metadata is missing', async () => {
      const tools = {
        tool1: tool({
          inputSchema: z4.object({
            value: z4.number().transform(value => value + 1),
          }),
          execute: async () => 'ok',
        }),
      };

      const approvalId = 'approval-signed';
      const toolCallId = 'call-1';
      const toolName = 'tool1';
      const input = { value: 1 };
      const signature = await signToolApproval({
        secret,
        approvalId,
        toolCallId,
        toolName,
        input,
      });

      const approval: CollectedToolApprovals<any> = {
        approvalRequest: {
          type: 'tool-approval-request',
          approvalId,
          toolCallId,
          signature,
        },
        approvalResponse: {
          type: 'tool-approval-response',
          approvalId,
          approved: true,
        },
        toolCall: {
          type: 'tool-call',
          toolCallId,
          toolName,
          input,
        },
      };

      const result = await validateApprovedToolApprovals({
        approvedToolApprovals: [approval],
        tools,
        toolApproval: undefined,
        messages: [],
        toolsContext: {} as any,
        runtimeContext: {},
        toolApprovalSecret: secret,
      });

      expect(result.approvedToolApprovals).toHaveLength(0);
      expect(result.invalidToolApprovals).toMatchObject([
        {
          toolCall: {
            input: { value: 1 },
          },
          error: {
            message: expect.stringMatching(
              /does not match the validated schema output/,
            ),
          },
        },
      ]);
    });

    it('should throw when the signature is missing and secret is configured', async () => {
>>>>>>> a4b0940b75 (fix: manual tool approvals reject or mutate transformed inputs across model and UI continuations (#21130))
      const tools = {
        tool1: tool({
          inputSchema: z4.object({ value: z4.string() }),
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
          inputSchema: z4.object({ value: z4.string() }),
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
          inputSchema: z4.object({ value: z4.string() }),
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
