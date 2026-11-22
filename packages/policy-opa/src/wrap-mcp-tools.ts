import type { Context, ModelMessage, Tool } from '@ai-sdk/provider-utils';
import type { ToolApprovalConfiguration } from 'ai';
import {
  type ApprovalFallbackStatus,
  getApprovalFallbackHook,
} from './approval-fallback';

/**
 * The arguments the SDK passes to a generic approval function, with the tool
 * call narrowed to what this helper needs.
 */
interface GenericApprovalArgs {
  toolCall: {
    type: 'tool-call';
    toolCallId: string;
    toolName: string;
    input: unknown;
    dynamic: boolean;
  };
  tools: unknown;
  toolsContext: unknown;
  runtimeContext: unknown;
  messages: ModelMessage[];
}

type GenericApproval = (args: GenericApprovalArgs) => unknown;

/**
 * The options the SDK passes to a per-tool approval function.
 */
interface PerToolApprovalOptions {
  toolCallId: string;
  messages: ModelMessage[];
  toolContext: unknown;
  runtimeContext: unknown;
}

/**
 * Result returned by {@link wrapMcpTools}: the original tool set plus a
 * `toolApproval` that falls back to a configurable default for any tool the
 * supplied approval does not explicitly handle.
 */
export interface WrappedMcpTools<
  TOOLS extends Record<string, Tool>,
  RUNTIME_CONTEXT extends Context | unknown | never,
> {
  tools: TOOLS;
  toolApproval: ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT>;
}

/**
 * Apply a fallback approval policy to a discovered tool set so the resulting
 * configuration is total: every tool in `tools` is gated either by the
 * supplied `approval` (when it has an opinion) or by `default` (otherwise).
 *
 * The motivating case is MCP. An MCP server hands you whatever tools it
 * exposes, and the agent's effective permissions become the union of the
 * full server surface. Without a fallback, any tool you forgot to write a
 * rule for is silently allowed. This helper closes that gap by forcing every
 * uncovered tool through `default` (which defaults to `user-approval` so the
 * human is in the loop for anything you didn't think about).
 *
 * Works for any tool set, not just MCP-discovered tools. The name reflects
 * the primary use case rather than a hard constraint.
 *
 * When `approval` is an `opaPolicy` approval, the fallback is applied to
 * every policy evaluation for a tool call, not only to the final decision. With
 * `{ default: 'denied' }` that keeps hard allowlist mode intact: a tool call
 * that the policy does not match is denied even when the evaluation with the
 * earlier tool calls of the same response asks for user approval.
 *
 * @example
 * ```ts
 * import { wrapMcpTools } from '@ai-sdk/policy-opa';
 * import { opaPolicy, wasmPolicyClient } from '@ai-sdk/policy-opa';
 *
 * const discovered = await mcpClient.tools();
 * const client = await wasmPolicyClient({ wasm });
 *
 * const { tools, toolApproval } = wrapMcpTools(
 *   discovered,
 *   opaPolicy({ client, path: 'agent/call/decision' }),
 *   { default: 'user-approval' }, // anything OPA does not match needs a human
 * );
 *
 * await generateText({ model, tools, toolApproval, prompt });
 * ```
 */
export function wrapMcpTools<
  TOOLS extends Record<string, Tool>,
  RUNTIME_CONTEXT extends Context | unknown | never = unknown,
>(
  tools: TOOLS,
  approval: ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT>,
  opts?: { default?: ApprovalFallbackStatus },
): WrappedMcpTools<TOOLS, RUNTIME_CONTEXT> {
  const fallback: ApprovalFallbackStatus = opts?.default ?? 'user-approval';

  if (typeof approval === 'function') {
    // An approval function created by `opaPolicy` applies the fallback to
    // every policy evaluation itself. That matters: the policy can decide on
    // one tool call twice, with and without the earlier tool calls of the
    // response, and a fallback of `denied` has to deny the unmatched
    // evaluation even when the other evaluation asks for user approval.
    const applyFallbackToPolicy =
      getApprovalFallbackHook<
        ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT>
      >(approval);
    const source =
      applyFallbackToPolicy == null
        ? approval
        : applyFallbackToPolicy(fallback);

    const wrapped: ToolApprovalConfiguration<
      TOOLS,
      RUNTIME_CONTEXT
    > = async args => {
      const status = await (
        source as (a: typeof args) => Promise<unknown> | unknown
      )(args);
      return isNotApplicable(status) ? fallback : (status as never);
    };
    return { tools, toolApproval: wrapped };
  }

  // Per-tool map form: fill in any tool that the user did not list with the
  // fallback decision. We use `Object.keys(tools)` (not the approval keys) so
  // the result is total over the discovered surface.
  // `Object.create(null)` gives the result no prototype, and we read the
  // supplied approval with an own-property check, so tool names that match
  // inherited object properties (e.g. `constructor`, `toString`, `valueOf`)
  // are treated as unconfigured and receive the fallback.
  const filled = Object.create(null) as Record<keyof TOOLS, unknown>;
  for (const name of Object.keys(tools) as Array<keyof TOOLS>) {
    const configured = Object.prototype.hasOwnProperty.call(approval, name)
      ? approval[name]
      : undefined;

    if (configured == null) {
      // Tool the user did not list: force it through the fallback.
      filled[name] = fallback;
    } else if (typeof configured === 'function') {
      // Per-tool approval function. An `opaPolicy` approval handles the
      // fallback itself (see the generic-function form) and needs the generic
      // arguments, which carry the tool name.
      const original = configured as (
        ...args: unknown[]
      ) => Promise<unknown> | unknown;
      const applyFallbackToPolicy =
        getApprovalFallbackHook<GenericApproval>(original);

      if (applyFallbackToPolicy != null) {
        const policy = applyFallbackToPolicy(fallback);
        filled[name] = async (
          input: unknown,
          options: PerToolApprovalOptions,
        ) => {
          const status = await policy({
            toolCall: {
              type: 'tool-call',
              toolCallId: options.toolCallId,
              toolName: String(name),
              input,
              dynamic: false,
            },
            tools,
            toolsContext: { [name]: options.toolContext },
            runtimeContext: options.runtimeContext,
            messages: options.messages,
          });
          return isNotApplicable(status) ? fallback : status;
        };
      } else {
        // Mirror the generic-function form so a "no opinion" result
        // (`not-applicable`/`undefined`) is forced through the fallback
        // instead of letting the tool run unapproved.
        filled[name] = async (...args: unknown[]) => {
          const status = await original(...args);
          return isNotApplicable(status) ? fallback : status;
        };
      }
    } else {
      // Static status the user explicitly configured: keep it as-is.
      filled[name] = configured;
    }
  }

  // `filled` is a plain per-tool map; cast to the SDK's map arm, which TS
  // can't infer from the erased `unknown` values.
  return {
    tools,
    toolApproval: filled as ToolApprovalConfiguration<TOOLS, RUNTIME_CONTEXT>,
  };
}

function isNotApplicable(status: unknown): boolean {
  if (status == null) return true;
  if (status === 'not-applicable') return true;
  if (typeof status === 'object' && status !== null) {
    return (status as { type?: unknown }).type === 'not-applicable';
  }
  return false;
}
