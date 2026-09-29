import assert from 'node:assert/strict';
import vm from 'node:vm';
import { tool } from 'ai';
import { validateApprovedToolApprovals } from 'ai/internal';
import { z } from 'zod';

const failureSignal =
  'ISSUE_21805: schema-valid cross-realm approval was rejected and the tool was not executed';

function approval(input: { name: string; birthDate: string }) {
  return {
    approvalRequest: {
      type: 'tool-approval-request' as const,
      approvalId: 'approval-1',
      toolCallId: 'call-1',
    },
    approvalResponse: {
      type: 'tool-approval-response' as const,
      approvalId: 'approval-1',
      approved: true,
    },
    toolCall: {
      type: 'tool-call' as const,
      toolCallId: 'call-1',
      toolName: 'addPerson' as const,
      input,
      dynamic: false as const,
    },
  };
}

async function main() {
  const input = {
    name: 'Joris Janssens',
    birthDate: '1980-02-10',
  };
  const revived = vm.runInNewContext(
    `({ name: "Joris Janssens", birthDate: "1980-02-10" })`,
  ) as typeof input;

  assert.equal(JSON.stringify(revived), JSON.stringify(input));
  assert.notEqual(revived.constructor, input.constructor);

  let executionCount = 0;
  const addPerson = tool({
    inputSchema: z.object({
      name: z.string(),
      birthDate: z.string().nullish(),
    }),
    execute: async () => {
      executionCount++;
      return 'ok';
    },
  });
  const tools = { addPerson };

  const sameRealm = await validateApprovedToolApprovals({
    approvedToolApprovals: [approval(input)],
    tools,
    toolApproval: undefined,
    messages: [],
    toolsContext: {},
    runtimeContext: {},
  });
  assert.equal(
    sameRealm.invalidToolApprovals.length,
    0,
    'same-realm control approval should be valid',
  );
  assert.equal(sameRealm.approvedToolApprovals.length, 1);

  const otherRealm = await validateApprovedToolApprovals({
    approvedToolApprovals: [approval(revived)],
    tools,
    toolApproval: undefined,
    messages: [],
    toolsContext: {},
    runtimeContext: {},
  });

  if (otherRealm.invalidToolApprovals.length > 0) {
    assert.equal(otherRealm.approvedToolApprovals.length, 0);
    assert.match(
      otherRealm.invalidToolApprovals[0].error.message,
      /Approved tool input does not match the validated schema output/,
    );
    assert.equal(executionCount, 0);
    console.error(failureSignal);
    process.exitCode = 1;
    return;
  }

  assert.equal(otherRealm.approvedToolApprovals.length, 1);
  await addPerson.execute(revived, {
    toolCallId: 'call-1',
    messages: [],
    context: {},
  });
  assert.equal(executionCount, 1);
  console.log('Issue #21805 did not reproduce.');
}

main().catch(error => {
  console.error('REPRODUCTION_HARNESS_ERROR', error);
  process.exitCode = 2;
});
