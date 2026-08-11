/**
 * Runnable demo composing `@ai-sdk/policy-opa` with a judgment-based second
 * opinion, for the cases a deterministic policy can't resolve on its own.
 *
 * Run from the package directory:
 *   pnpm tsx examples/mock/composed-judgment.ts
 *
 * WHY THIS COMPOSITION
 *
 * OPA is the right tool for a hard, deterministic rule ("never let a
 * non-admin call `sendPayment`") -- a boolean expression over known fields.
 * It's the wrong tool for "is *this specific* payment, in *this* context,
 * actually sound" -- a question with no fixed rule to write. This example
 * shows OPA handling the deterministic layer first, and only escalating to a
 * judgment call for the case OPA itself flags as `requires-approval` (mapped
 * by the SDK to `user-approval`) -- instead of routing that case straight to
 * a human, ask an independent judgment service first and only fall through
 * to a human when the judgment call is itself uncertain.
 *
 *   tool call
 *     -> OPA evaluates      --+--> allow / deny (clear-cut)  -> resolved, no judgment call
 *                              |
 *                              +--> requires-approval          -> ask a judgment service
 *                                                                    +--> confident verdict -> resolved
 *                                                                    +--> still uncertain    -> SDK's
 *                                                                                                human-in-the-loop UI
 *
 * `judgmentCall` below is a minimal interface (one async function, one
 * verdict shape) so ANY judgment provider can be plugged in -- an in-house
 * LLM-as-judge, a compliance review service, or a hosted verdict API. This
 * example stubs it (deterministic, no network call, no API key) so it runs
 * the same way `examples/mock/basic.ts` does. A concrete, live-verified
 * implementation against a real judgment API (invinoveritas's `/review`,
 * <https://github.com/babyblueviper1/invinoveritas/tree/main/integrations/vercel-ai-sdk>)
 * is linked in the README for anyone who wants the non-stubbed version --
 * swapping it in is a one-line change to `judgmentCall` below, same as
 * swapping `MockLanguageModelV3` for a real provider.
 *
 * To swap the mock model for a real provider, replace the
 * `MockLanguageModelV3` construction with one line, e.g.
 * `model: anthropic('claude-sonnet-4-5')`. Everything else (tools,
 * toolApproval, policy, judgmentCall) is provider-agnostic.
 */
import { jsonSchema, type InferToolSetContext } from '@ai-sdk/provider-utils';
import {
  generateText,
  isStepCount,
  tool,
  type GenericToolApprovalFunction,
  type ToolApprovalStatus,
  type ToolSet,
} from 'ai';
import { MockLanguageModelV3 } from 'ai/test';
import type { PolicyClient } from '../../src/policy-client';
import { opaPolicy } from '../../src/opa/opa-policy';

type ToolsContext = InferToolSetContext<ToolSet>;

const dummyUsage = {
  inputTokens: {
    total: 3,
    noCache: 3,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: { total: 10, text: 10, reasoning: undefined },
} as const;

function mockModel(toolName: string, input: string): MockLanguageModelV3 {
  let step = 0;
  return new MockLanguageModelV3({
    doGenerate: async () => {
      switch (step++) {
        case 0:
          return {
            warnings: [],
            usage: dummyUsage,
            finishReason: { unified: 'tool-calls', raw: undefined },
            content: [
              {
                type: 'tool-call',
                toolCallType: 'function',
                toolCallId: 'call-1',
                toolName,
                input,
              },
            ],
          };
        default:
          return {
            warnings: [],
            usage: dummyUsage,
            finishReason: { unified: 'stop', raw: 'stop' },
            content: [{ type: 'text', text: 'understood, stopping.' }],
          };
      }
    },
  });
}

/**
 * A tiny OPA stand-in: a real, hard ceiling (deny anything over $1M outright)
 * plus explicit `requires-approval` for everything else, so this example
 * demonstrates OPA actually owning the deterministic rule rather than just
 * asserting it in a comment.
 */
const opaClient: PolicyClient = {
  async evaluate(_path, input) {
    const amount = (input as { args?: { amount?: number } }).args?.amount ?? 0;
    if (amount > 1_000_000) {
      return {
        decision: 'deny',
        reason: 'payments over $1M are never auto-approved',
      } as never;
    }
    return { decision: 'requires-approval' } as never;
  },
};

/**
 * Minimal judgment-provider interface: given the tool call, return a verdict
 * with a confidence score. Any provider (in-house LLM judge, a hosted
 * verdict API, a compliance service) implements this same shape.
 */
interface JudgmentVerdict {
  verdict: 'approve' | 'reject' | 'uncertain';
  confidence: number;
  reason: string;
}

type JudgmentCall = (toolCall: {
  toolName: string;
  input: unknown;
}) => Promise<JudgmentVerdict>;

/**
 * Stub judgment call -- deterministic, no network, so this example runs the
 * same way examples/mock/basic.ts does. A real implementation calls out to
 * a judgment service and returns its verdict in this same shape; see the
 * module docstring above for a live-verified example.
 */
const stubJudgmentCall: JudgmentCall = async ({ input }) => {
  const amount = (input as { amount?: number }).amount ?? 0;
  if (amount > 100_000) {
    return {
      verdict: 'reject',
      confidence: 0.95,
      reason:
        'Payment amount far exceeds any precedent for this account; needs a human.',
    };
  }
  return {
    verdict: 'approve',
    confidence: 0.92,
    reason:
      'Amount, recipient, and context match prior approved payments for this account.',
  };
};

/**
 * Compose an OPA policy with a judgment call: OPA resolves clear-cut cases;
 * a `requires-approval` (or unmatched / not-applicable) result escalates to
 * the judgment call instead of going straight to a human. The judgment call
 * only resolves automatically above a confidence threshold -- anything less
 * still falls through to the SDK's own human-in-the-loop UI.
 */
function composedToolApproval(opts: {
  opaClient: PolicyClient;
  opaPath: string;
  judgmentCall: JudgmentCall;
  approveConfidence?: number;
}): GenericToolApprovalFunction<ToolSet, ToolsContext, unknown> {
  // opaPolicy's return type is a union (a single generic function, OR a
  // per-tool-keyed object) so that it can be used either way as the SDK's
  // `toolApproval` option -- opaPolicy itself always returns the function
  // arm (see its implementation), the union is only there to satisfy the
  // wider ToolApprovalConfiguration contract, so the cast here is safe.
  const policy = opaPolicy({
    client: opts.opaClient,
    path: opts.opaPath,
  }) as GenericToolApprovalFunction<ToolSet, ToolsContext, unknown>;
  const threshold = opts.approveConfidence ?? 0.9;

  return async (args): Promise<ToolApprovalStatus> => {
    // `undefined` is documented as equivalent to 'not-applicable'.
    const opaResult = (await policy(args)) ?? 'not-applicable';
    const opaType = typeof opaResult === 'string' ? opaResult : opaResult.type;

    if (opaType !== 'user-approval' && opaType !== 'not-applicable') {
      // OPA resolved this on its own (a clear allow or deny) -- done.
      return opaResult;
    }

    // OPA has no fixed rule for this case (or explicitly flagged it as
    // needing review) -- get an independent judgment call before falling
    // through to a human.
    const verdict = await opts.judgmentCall(args.toolCall);

    if (verdict.verdict === 'approve' && verdict.confidence >= threshold) {
      return {
        type: 'approved',
        reason: `judgment: ${verdict.reason} (confidence ${verdict.confidence})`,
      };
    }
    if (verdict.verdict === 'reject' && verdict.confidence >= threshold) {
      return {
        type: 'denied',
        reason: `judgment: ${verdict.reason} (confidence ${verdict.confidence})`,
      };
    }
    // Uncertain, or below the confidence bar -- escalate to a human, same
    // as OPA's own `requires-approval` would have.
    return 'user-approval';
  };
}

const sendPaymentTool = tool({
  description: 'Send a payment to a recipient',
  inputSchema: jsonSchema<{ recipient: string; amount: number }>({
    type: 'object',
    properties: {
      recipient: { type: 'string' },
      amount: { type: 'number' },
    },
    required: ['recipient', 'amount'],
  }),
  execute: async ({ recipient, amount }) => `sent $${amount} to ${recipient}`,
});

function printResult(label: string, result: { responseMessages: unknown }) {
  const messages = result.responseMessages as Array<{
    role: string;
    content: Array<Record<string, unknown>>;
  }>;
  // biome-ignore lint/suspicious/noConsole: example output is the whole point
  console.log(`\n=== ${label} ===`);
  for (const m of messages) {
    for (const c of m.content) {
      // biome-ignore lint/suspicious/noConsole: example output is the whole point
      console.log(`[${m.role}] ${c.type}`, summarize(c));
    }
  }
}

function summarize(c: Record<string, unknown>): string {
  if (c.type === 'tool-call') {
    return `${c.toolName as string}(${JSON.stringify(c.input)})`;
  }
  if (c.type === 'tool-result') {
    const out = c.output as { type: string; reason?: string } | string;
    return typeof out === 'string' ? out : `${out.type}: ${out.reason ?? ''}`;
  }
  if (c.type === 'tool-approval-response') {
    return `approved=${c.approved as boolean} reason=${c.reason as string | undefined}`;
  }
  if (c.type === 'text') return JSON.stringify(c.text);
  return '';
}

async function main() {
  const toolApproval = composedToolApproval({
    opaClient,
    opaPath: 'agent/call/decision',
    judgmentCall: stubJudgmentCall,
  });

  // 1. OPA has no fixed rule for a $500 payment (below its $1M ceiling) --
  //    falls through to the judgment call, which approves it with high
  //    confidence.
  const approved = await generateText({
    model: mockModel(
      'sendPayment',
      `{ "recipient": "vendor-a", "amount": 500 }`,
    ),
    prompt: 'pay our vendor $500',
    stopWhen: isStepCount(3),
    tools: { sendPayment: sendPaymentTool },
    toolApproval,
  });
  printResult('1. judgment approves: routine $500 payment', approved);

  // 2. A $250,000 payment is still under OPA's hard $1M ceiling, so it also
  //    falls through -- the judgment call rejects it with high confidence,
  //    no human needed to see it denied.
  const denied = await generateText({
    model: mockModel(
      'sendPayment',
      `{ "recipient": "unknown-account", "amount": 250000 }`,
    ),
    prompt: 'send $250,000 to this new account',
    stopWhen: isStepCount(3),
    tools: { sendPayment: sendPaymentTool },
    toolApproval,
  });
  printResult('2. judgment denies: anomalous $250,000 payment', denied);

  // 3. $5,000,000 is over OPA's hard ceiling -- denied outright, the
  //    judgment call is never even consulted.
  const opaOnlyDenied = await generateText({
    model: mockModel(
      'sendPayment',
      `{ "recipient": "unknown-account", "amount": 5000000 }`,
    ),
    prompt: 'send $5,000,000 to this new account',
    stopWhen: isStepCount(3),
    tools: { sendPayment: sendPaymentTool },
    toolApproval,
  });
  printResult(
    '3. OPA denies outright: $5,000,000 payment (over the hard ceiling)',
    opaOnlyDenied,
  );
}

main().catch(err => {
  // biome-ignore lint/suspicious/noConsole: example output is the whole point
  console.error(err);
  process.exit(1);
});
