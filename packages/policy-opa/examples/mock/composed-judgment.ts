/**
 * Runnable demo composing `@ai-sdk/policy-opa` with a contextual judgment
 * service for cases a deterministic policy cannot resolve on its own.
 *
 * Run from the package directory:
 *   pnpm tsx examples/mock/composed-judgment.ts
 *
 * OPA handles the hard limit first. Calls that need more review go to an
 * independent judgment service, which can use the tool call, runtime context,
 * and conversation messages. Only confident verdicts are applied
 * automatically; uncertain or unavailable judgments fall back to a human.
 *
 *   tool call
 *     -> OPA evaluates      --+--> allow / deny (clear-cut)  -> resolved, no judgment call
 *                              |
 *                              +--> requires-approval          -> ask a judgment service
 *                                                                    +--> confident verdict -> resolved
 *                                                                    +--> still uncertain    -> SDK's
 *                                                                                                human-in-the-loop UI
 *
 * `judgmentCall` is a provider-neutral async function. This example stubs it
 * so the script is deterministic and needs no API key. A production
 * implementation can call an in-house model, compliance service, or hosted
 * verdict API using the same request and response shapes.
 *
 * To swap the mock model for a real provider, replace the
 * `MockLanguageModelV3` construction with one line, e.g.
 * `model: anthropic('claude-sonnet-4-5')`. Everything else (tools,
 * toolApproval, policy, judgmentCall) is provider-agnostic.
 */
import {
  jsonSchema,
  type Context,
  type InferToolSetContext,
  type ModelMessage,
} from '@ai-sdk/provider-utils';
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

type PaymentRuntimeContext = Context & {
  accountId: string;
  approvedRecipients: string[];
  largestApprovedPayment: number;
};

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

interface JudgmentRequest {
  toolCall: { toolName: string; input: unknown };
  messages: ReadonlyArray<ModelMessage>;
  runtimeContext: PaymentRuntimeContext;
}

type JudgmentCall = (request: JudgmentRequest) => Promise<JudgmentVerdict>;

/**
 * Stub judgment call -- deterministic and context-aware, but with no network
 * call. A real implementation can send this request to a judgment service and
 * return its verdict in the same shape.
 */
const stubJudgmentCall: JudgmentCall = async ({ toolCall, runtimeContext }) => {
  const { amount, recipient } = toolCall.input as {
    amount: number;
    recipient: string;
  };
  const knownRecipient = runtimeContext.approvedRecipients.includes(recipient);

  if (knownRecipient && amount <= runtimeContext.largestApprovedPayment) {
    return {
      verdict: 'approve',
      confidence: 0.96,
      reason: `Recipient and amount match prior payments for ${runtimeContext.accountId}.`,
    };
  }

  if (!knownRecipient && amount > 100_000) {
    return {
      verdict: 'reject',
      confidence: 0.95,
      reason: `Large payment to an unknown recipient for ${runtimeContext.accountId}.`,
    };
  }

  return {
    verdict: 'uncertain',
    confidence: 0.55,
    reason: `No sufficient payment precedent for ${runtimeContext.accountId}.`,
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
  confidenceThreshold?: number;
}): GenericToolApprovalFunction<ToolSet, ToolsContext, PaymentRuntimeContext> {
  // opaPolicy is implemented as a generic function, but its public return
  // type also permits a per-tool map. Narrow that union before composing it.
  const policy = opaPolicy<ToolSet, PaymentRuntimeContext>({
    client: opts.opaClient,
    path: opts.opaPath,
  });
  if (typeof policy !== 'function') {
    throw new Error('opaPolicy must return a generic approval function');
  }

  const threshold = opts.confidenceThreshold ?? 0.9;

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
    let verdict: JudgmentVerdict;
    try {
      verdict = await opts.judgmentCall({
        toolCall: args.toolCall,
        messages: args.messages,
        runtimeContext: args.runtimeContext,
      });
    } catch {
      // A production judgment provider should enforce its own timeout and
      // reject on transport failures. Without a verdict, require a human.
      return 'user-approval';
    }

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
  if (c.type === 'tool-approval-request') {
    return `automatic=${c.isAutomatic === true}`;
  }
  if (c.type === 'text') return JSON.stringify(c.text);
  return '';
}

async function main() {
  const runtimeContext: PaymentRuntimeContext = {
    accountId: 'acct-123',
    approvedRecipients: ['vendor-a'],
    largestApprovedPayment: 1_000,
  };
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
    runtimeContext,
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
    runtimeContext,
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
    runtimeContext,
  });
  printResult(
    '3. OPA denies outright: $5,000,000 payment (over the hard ceiling)',
    opaOnlyDenied,
  );

  // 4. A small payment to an unfamiliar recipient has no clear precedent.
  //    The judgment service is not confident enough to decide, so the SDK
  //    emits a tool-approval-request for a human.
  const needsHuman = await generateText({
    model: mockModel(
      'sendPayment',
      `{ "recipient": "new-vendor", "amount": 500 }`,
    ),
    prompt: 'pay a new vendor $500',
    stopWhen: isStepCount(3),
    tools: { sendPayment: sendPaymentTool },
    toolApproval,
    runtimeContext,
  });
  printResult('4. judgment uncertain: request human approval', needsHuman);
}

main().catch(err => {
  // biome-ignore lint/suspicious/noConsole: example output is the whole point
  console.error(err);
  process.exit(1);
});
