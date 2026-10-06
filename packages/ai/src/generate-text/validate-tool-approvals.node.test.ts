import { runInNewContext } from 'node:vm';
import { tool } from '@ai-sdk/provider-utils';
import { expect, it } from 'vitest';
import { z } from 'zod/v3';
import { validateApprovedToolApprovals } from './validate-tool-approvals';

it('should keep approvals for structurally equal cross-realm inputs', async () => {
  const input = runInNewContext(
    `({
      name: 'Joris Janssens',
      birthDate: '1980-02-10',
      aliases: ['JJ'],
    })`,
  ) as {
    name: string;
    birthDate: string;
    aliases: string[];
  };

  const result = await validateApprovedToolApprovals({
    approvedToolApprovals: [
      {
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
        toolCall: {
          type: 'tool-call',
          toolCallId: 'call-1',
          toolName: 'addPerson',
          input,
        },
      },
    ],
    tools: {
      addPerson: tool({
        inputSchema: z.object({
          name: z.string(),
          birthDate: z.string().nullish(),
          aliases: z.array(z.string()),
        }),
        execute: async () => 'ok',
      }),
    },
    toolApproval: undefined,
    messages: [],
    toolsContext: {},
    runtimeContext: {},
  });

  expect(result.approvedToolApprovals).toHaveLength(1);
  expect(result.invalidToolApprovals).toHaveLength(0);
});
