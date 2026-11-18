import type {
  Context,
  InferToolSetContext,
  ModelMessage,
  ToolSet,
} from '@ai-sdk/provider-utils';
import type { ToolApprovalConfiguration } from 'ai';
import type { PolicyClient } from '../policy-client';
import type { PolicyDecision } from '../policy-decision';
import { evaluatePolicy } from './evaluate-policy';
import { normalizeOpaDecision } from './normalize-opa-decision';

/**
 * The default shape passed to the OPA rule as `input` when no `toInput` is
 * supplied. Rego rules can read `input.tool.name`, `input.args`, and so on.
 */
export interface DefaultOpaInput {
  tool: { name: string };
  args: unknown;
  /**
   * The messages that were sent to the model to start the response that
   * contains the tool call. They do not include that response. For a tool call
   * that follows other tool calls in the same response, the policy is also
   * evaluated with those earlier calls appended (see {@link opaPolicy}).
   *
   * A tool call that a user approved is evaluated once more before it runs.
   * The messages then include the response with the tool call and the
   * approval.
   */
  messages: ReadonlyArray<ModelMessage>;
  runtimeContext: unknown;
}

/**
 * A tool call that this policy has evaluated for one model response.
 */
interface EvaluatedToolCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
  /**
   * The decision for the call. `undefined` until the evaluation has finished.
   */
  decision?: PolicyDecision;
}

/**
 * The tool calls of one model response, and the evaluation that runs last.
 */
interface ResponseEvaluations {
  toolCalls: EvaluatedToolCall[];
  lastEvaluation: Promise<void>;
}

/**
 * Construct a {@link ToolApprovalConfiguration} backed by an OPA policy.
 *
 * The returned generic approval function evaluates the supplied Rego entry
 * (`path`) for every tool call and maps the result to the SDK's approval
 * status via {@link normalizeOpaDecision}. Pass the result directly as
 * `toolApproval` on `generateText` / `streamText` / `ToolLoopAgent`.
 *
 * A model response can contain several tool calls. The SDK decides on all of
 * them before it runs any of them, and passes the same `messages` for each:
 * the conversation before that response. A rule that counts earlier calls,
 * such as a budget or "only one delete", would approve each call on its own.
 * So every call after the first one of a response is evaluated twice: with
 * `messages` as passed, and with the earlier calls of the response appended
 * as an assistant message (denied calls are followed by an `execution-denied`
 * tool result). The more restrictive of the two decisions applies. A limit
 * therefore counts the earlier calls, and a rule that requires an earlier call
 * is not satisfied by a call that has not run yet.
 *
 * ```ts
 * import { wasmPolicyClient } from '@ai-sdk/policy-opa';
 * import { opaPolicy } from '@ai-sdk/policy-opa';
 *
 * const client = await wasmPolicyClient({ wasm });
 * const toolApproval = opaPolicy({ client, path: 'agent/call/decision' });
 *
 * await generateText({ model, tools, toolApproval, prompt });
 * ```
 *
 * @param opts.client    The OPA client (HTTP or WASM).
 * @param opts.path      The Rego entrypoint that returns the decision object.
 * @param opts.toInput   Optional transformer to shape the OPA input.
 */
export function opaPolicy<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context | unknown | never = unknown,
>(opts: {
  client: PolicyClient;
  path: string;
  toInput?: (args: {
    toolCall: { toolName: string; toolCallId: string; input: unknown };
    tools: TOOLS | undefined;
    toolsContext: InferToolSetContext<TOOLS>;
    runtimeContext: RUNTIME_CONTEXT;
    messages: ModelMessage[];
  }) => unknown;
}): ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT> {
  const { client, path, toInput } = opts;

  // The SDK passes the same `messages` array for every tool call of one model
  // response and a new array for the next response, so the array identifies
  // the response. Calls that reach this function with another array are not
  // related to each other and are evaluated once, as before.
  //
  // The evaluation with the earlier tool calls can only make a decision more
  // restrictive. A caller that reuses one array for several responses gets
  // decisions that count more tool calls than necessary, never fewer than the
  // evaluation without them.
  const responses = new WeakMap<ModelMessage[], ResponseEvaluations>();

  const decide = async (opaInput: unknown): Promise<PolicyDecision> => {
    // Fail closed: a backend error must not be read as "no opinion". Deny so
    // the model sees a structured result it can reason about, rather than the
    // error rejecting out of the callback and aborting the run.
    const outcome = await evaluatePolicy(client, path, opaInput);
    if (!outcome.ok) {
      return {
        type: 'denied',
        reason: `policy evaluation failed: ${errorMessage(outcome.error)}`,
      };
    }

    return normalizeOpaDecision(outcome.result);
  };

  return ({ toolCall, tools, toolsContext, runtimeContext, messages }) => {
    const toOpaInput = (inputMessages: ModelMessage[]) =>
      toInput?.({
        toolCall,
        tools,
        toolsContext,
        runtimeContext,
        messages: inputMessages,
      }) ??
      ({
        tool: { name: toolCall.toolName },
        args: toolCall.input,
        messages: inputMessages,
        runtimeContext,
      } satisfies DefaultOpaInput);

    // The SDK checks a tool call that a user approved once more before it runs
    // it. `messages` then contain the response with that tool call and with
    // the other tool calls of the response, so there is nothing to append.
    if (isToolCallFromMessages(messages, toolCall)) {
      return (async () => decide(toOpaInput(messages)))();
    }

    let response = responses.get(messages);
    if (response == null) {
      response = { toolCalls: [], lastEvaluation: Promise.resolve() };
      responses.set(messages, response);
    }

    const earlierToolCalls = [...response.toolCalls];
    const currentToolCall: EvaluatedToolCall = {
      toolCallId: toolCall.toolCallId,
      toolName: toolCall.toolName,
      input: toolCall.input,
    };
    response.toolCalls.push(currentToolCall);

    const evaluate = async (): Promise<PolicyDecision> => {
      const opaInput = toOpaInput(messages);
      let decision = await decide(opaInput);

      // A denial cannot become more restrictive.
      if (decision.type !== 'denied') {
        const messagesWithEarlierToolCalls = appendEarlierToolCalls(
          messages,
          earlierToolCalls,
        );

        if (messagesWithEarlierToolCalls !== messages) {
          const opaInputWithEarlierToolCalls = toOpaInput(
            messagesWithEarlierToolCalls,
          );

          // A custom `toInput` that does not use `messages` produces the same
          // input twice. OPA receives its input as JSON, so two inputs with
          // the same JSON are one input, and evaluating it again cannot change
          // the decision.
          if (
            toInput == null ||
            !isSameInput(opaInput, opaInputWithEarlierToolCalls)
          ) {
            decision = moreRestrictiveDecision(
              decision,
              await decide(opaInputWithEarlierToolCalls),
            );
          }
        }
      }

      currentToolCall.decision = decision;
      return decision;
    };

    // Evaluate the calls of a response one after the other, in the order they
    // arrived, so that each evaluation knows which earlier calls were denied.
    // This also holds when the caller does not wait for one decision before
    // it asks for the next.
    const evaluation = response.lastEvaluation.then(evaluate);
    response.lastEvaluation = evaluation.then(
      () => undefined,
      () => undefined,
    );
    return evaluation;
  };
}

/**
 * Returns `messages` followed by the earlier tool calls of the same response,
 * in the shape they have once they are part of the conversation: an assistant
 * message with the tool calls and, for denied calls, a tool message with their
 * `execution-denied` results. Calls that are not denied have no result yet.
 *
 * Returns `messages` itself when there is nothing to append.
 */
function appendEarlierToolCalls(
  messages: ModelMessage[],
  earlierToolCalls: EvaluatedToolCall[],
): ModelMessage[] {
  if (earlierToolCalls.length === 0) return messages;

  const appended: ModelMessage[] = [
    {
      role: 'assistant',
      content: earlierToolCalls.map(({ toolCallId, toolName, input }) => ({
        type: 'tool-call',
        toolCallId,
        toolName,
        input,
      })),
    },
  ];

  const deniedToolCalls = earlierToolCalls.filter(
    earlierToolCall => earlierToolCall.decision?.type === 'denied',
  );
  if (deniedToolCalls.length > 0) {
    appended.push({
      role: 'tool',
      content: deniedToolCalls.map(({ toolCallId, toolName, decision }) => ({
        type: 'tool-result',
        toolCallId,
        toolName,
        output: {
          type: 'execution-denied',
          ...(decision?.type === 'denied' && decision.reason != null
            ? { reason: decision.reason }
            : {}),
        },
      })),
    });
  }

  return [...messages, ...appended];
}

/**
 * Returns whether the tool call is one of the tool calls in `messages`.
 *
 * When the SDK checks a tool call that a user approved, it passes the tool call
 * of the conversation, with the same `input` object. A tool call of a new
 * response is parsed from that response, so its `input` is a new object, also
 * when it has the ID of a tool call in `messages`. Tool call IDs can repeat:
 * some providers number the tool calls of every response from zero.
 *
 * An `input` that is not an object cannot be told apart this way. Such a tool
 * call is treated as new, which can only make the decision more restrictive.
 */
function isToolCallFromMessages(
  messages: ModelMessage[],
  toolCall: { toolCallId: string; input: unknown },
): boolean {
  const { toolCallId, input } = toolCall;
  if (typeof input !== 'object' || input === null) return false;

  return messages.some(
    message =>
      message.role === 'assistant' &&
      Array.isArray(message.content) &&
      message.content.some(
        part =>
          part.type === 'tool-call' &&
          part.toolCallId === toolCallId &&
          part.input === input,
      ),
  );
}

const decisionRestrictiveness: Record<PolicyDecision['type'], number> = {
  approved: 0,
  'not-applicable': 1,
  'user-approval': 2,
  denied: 3,
};

/**
 * Returns `other` when it restricts the tool call more than `decision` does,
 * and `decision` otherwise.
 */
function moreRestrictiveDecision(
  decision: PolicyDecision,
  other: PolicyDecision,
): PolicyDecision {
  return decisionRestrictiveness[other.type] >
    decisionRestrictiveness[decision.type]
    ? other
    : decision;
}

function isSameInput(input: unknown, other: unknown): boolean {
  try {
    return JSON.stringify(input) === JSON.stringify(other);
  } catch {
    // Not serializable: treat the inputs as different and evaluate both.
    return false;
  }
}

function errorMessage(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  if (typeof cause === 'object' && cause !== null) {
    try {
      return JSON.stringify(cause);
    } catch {
      // Fall through for circular / non-serializable objects.
    }
  }
  return String(cause);
}

/**
 * Optional variant of {@link opaPolicy} that gracefully degrades when no
 * policy backend is available.
 *
 * Returns `undefined` when `client` is `undefined`. Pass that directly as
 * `toolApproval` and the SDK falls back to its default allow-all behavior.
 * When `client` is supplied, behaves exactly like {@link opaPolicy}.
 *
 * Use this when the policy file is configured per environment (e.g. loaded
 * in production, absent in local development):
 *
 * ```ts
 * import { readFile } from 'node:fs/promises';
 * import { optionalOpaPolicy, wasmPolicyClient } from '@ai-sdk/policy-opa';
 *
 * const wasm = process.env.POLICY_WASM_PATH
 *   ? await readFile(process.env.POLICY_WASM_PATH)
 *   : undefined;
 * const client = wasm ? await wasmPolicyClient({ wasm }) : undefined;
 *
 * const toolApproval = optionalOpaPolicy({
 *   client,
 *   path: 'agent/call/decision',
 * });
 *
 * await generateText({ model, tools, toolApproval, prompt });
 * ```
 */
export function optionalOpaPolicy<
  TOOLS extends ToolSet = ToolSet,
  RUNTIME_CONTEXT extends Context | unknown | never = unknown,
>(opts: {
  client: PolicyClient | undefined;
  path: string;
  toInput?: (args: {
    toolCall: { toolName: string; toolCallId: string; input: unknown };
    tools: TOOLS | undefined;
    toolsContext: InferToolSetContext<TOOLS>;
    runtimeContext: RUNTIME_CONTEXT;
    messages: ModelMessage[];
  }) => unknown;
}): ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT> | undefined {
  if (opts.client == null) return undefined;
  return opaPolicy<TOOLS, RUNTIME_CONTEXT>({
    client: opts.client,
    path: opts.path,
    toInput: opts.toInput,
  });
}
