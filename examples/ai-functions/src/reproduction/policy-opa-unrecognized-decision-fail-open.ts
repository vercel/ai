import { jsonSchema, tool } from '@ai-sdk/provider-utils';
import { generateText, isStepCount } from 'ai';
import { MockLanguageModelV3 } from 'ai/test';

const dummyUsage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
} as const;

function modelEmittingChargeCardCall() {
  let step = 0;

  return new MockLanguageModelV3({
    doGenerate: async () => {
      if (step++ === 0) {
        return {
          warnings: [],
          usage: dummyUsage,
          finishReason: { unified: 'tool-calls', raw: undefined },
          content: [
            {
              type: 'tool-call',
              toolCallType: 'function',
              toolCallId: 'charge-1',
              toolName: 'chargeCard',
              input: JSON.stringify({ amountCents: 2500 }),
            },
          ],
        };
      }

      return {
        warnings: [],
        usage: dummyUsage,
        finishReason: { unified: 'stop', raw: 'stop' },
        content: [{ type: 'text', text: 'done' }],
      };
    },
  });
}

async function main() {
  // Use the target branch's source directly without adding a reproduction-only
  // workspace dependency to the example package.
  const policyOpaModuleUrl = new URL(
    '../../../../packages/policy-opa/src/index.ts',
    import.meta.url,
  ).href;
  const { normalizeOpaDecision, opaPolicy, optionalOpaPolicy, wrapMcpTools } =
    await import(policyOpaModuleUrl);

  async function runArm({
    name,
    decision,
    backendError,
    optionalClient,
    wrap,
  }: {
    name: string;
    decision?: unknown;
    backendError?: boolean;
    optionalClient?: boolean;
    wrap?: boolean;
  }) {
    let executionCount = 0;
    const tools = {
      chargeCard: tool({
        inputSchema: jsonSchema<{ amountCents: number }>({
          type: 'object',
          properties: { amountCents: { type: 'number' } },
          required: ['amountCents'],
        }),
        execute: async () => {
          executionCount++;
          return { charged: true };
        },
      }),
    };

    const client = {
      async evaluate() {
        if (backendError) {
          throw new Error('OPA unavailable');
        }
        return decision;
      },
    };

    let toolApproval = optionalClient
      ? optionalOpaPolicy({
          client: undefined,
          path: 'agent/call/decision',
        })
      : opaPolicy({
          client,
          path: 'agent/call/decision',
        });

    if (wrap) {
      toolApproval = wrapMcpTools(tools, toolApproval).toolApproval;
    }

    const result = await generateText({
      model: modelEmittingChargeCardCall(),
      prompt: 'Charge 2500 cents.',
      stopWhen: isStepCount(3),
      tools,
      toolApproval,
    });

    const approvalRequests = result.steps
      .flatMap(step => step.content)
      .filter(part => part.type === 'tool-approval-request').length;
    const normalized =
      backendError || optionalClient
        ? 'n/a'
        : normalizeOpaDecision(decision).type;

    const outcome = {
      name,
      executed: executionCount > 0,
      approvalRequests,
      normalized,
    };
    console.log(JSON.stringify(outcome));
    return outcome;
  }

  const malformed = await Promise.all([
    runArm({ name: 'wrong-enum', decision: { decision: 'blocked' } }),
    runArm({ name: 'legacy-non-boolean', decision: { allow: 'false' } }),
    runArm({ name: 'unknown-key', decision: { verdict: 'deny' } }),
    runArm({
      name: 'nested-unexpected-shape',
      decision: { result: { decision: 'deny' } },
    }),
  ]);

  const validDeny = await runArm({
    name: 'valid-deny',
    decision: { decision: 'deny' },
  });
  const explicitNotApplicable = await runArm({
    name: 'explicit-not-applicable',
    decision: { decision: 'not-applicable' },
  });
  const backendFailure = await runArm({
    name: 'backend-error',
    backendError: true,
  });
  const optionalNoClient = await runArm({
    name: 'optional-no-client',
    optionalClient: true,
  });
  const wrappedMalformed = await runArm({
    name: 'wrapped-wrong-enum',
    decision: { decision: 'blocked' },
    wrap: true,
  });

  if (validDeny.executed) {
    throw new Error('Control failure: a recognized deny decision executed.');
  }
  if (!explicitNotApplicable.executed) {
    throw new Error(
      'Control failure: explicit not-applicable did not retain documented allow behavior.',
    );
  }
  if (backendFailure.executed) {
    throw new Error('Control failure: a backend error did not fail closed.');
  }
  if (!optionalNoClient.executed) {
    throw new Error(
      'Control failure: optionalOpaPolicy without a client did not allow execution.',
    );
  }
  if (wrappedMalformed.executed || wrappedMalformed.approvalRequests !== 1) {
    throw new Error(
      'Control failure: wrapMcpTools did not require approval for an unrecognized decision.',
    );
  }

  const failOpenArms = malformed.filter(result => result.executed);
  if (failOpenArms.length > 0) {
    console.error(
      `ISSUE #19978 REPRODUCED: unrecognized OPA decisions executed the protected chargeCard tool (${failOpenArms.map(result => result.name).join(', ')})`,
    );
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
