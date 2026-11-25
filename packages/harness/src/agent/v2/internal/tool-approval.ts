import type {
  ModelMessage,
  Tool,
  ToolApprovalResponse,
  ToolSet,
} from '@ai-sdk/provider-utils';
import type {
  ToolApprovalRequestOutput,
  ToolApprovalStatus,
  TypedToolCall,
} from 'ai';
import { HarnessCapabilityUnsupportedError } from '../../../errors/harness-capability-unsupported-error';
import { DEFAULT_PERMISSION_MODE } from '../../internal/permission-mode';
import type {
  HarnessAgentLog,
  HarnessAgentLogToolApproval,
  HarnessAgentLogToolApprovalRequestEvent,
} from './create-log';

/**
 * What an approval requirement is attached to: one of the app's own tools, or
 * one of the harness adapter's built-in tools.
 */
export type ToolApprovalTargetKind = 'tool' | 'built-in tool';

/**
 * Approval status of a tool, as resolved from the agent's `toolApproval`
 * setting. Mirrors the object form of the AI SDK's `ToolApprovalStatus`.
 */
export type ResolvedToolApprovalStatus = Exclude<
  ToolApprovalStatus,
  string | undefined
>;

/**
 * The agent's `toolApproval` setting, validated and normalized to object
 * statuses, by tool name.
 */
export type ToolApprovalPolicy = Readonly<
  Record<string, ResolvedToolApprovalStatus>
>;

/**
 * Response to a tool approval request, as given by the app.
 */
export type ToolApprovalResponseInput = Pick<
  ToolApprovalResponse,
  'approvalId' | 'approved' | 'reason'
>;

const TOOL_APPROVAL_STATUSES = new Set<string>([
  'not-applicable',
  'approved',
  'denied',
  'user-approval',
] satisfies ReadonlyArray<ResolvedToolApprovalStatus['type']>);

/**
 * Returns whether a tool asks for a user's consent before it may run.
 *
 * `needsApproval` may be a boolean or a function of the tool input, but the v2
 * engine can evaluate neither, so every value except `false` and `undefined`
 * counts as an approval requirement and fails closed, including unknown values
 * of malformed tool definitions.
 */
export function requiresApproval(tool: Tool): boolean {
  const needsApproval = (tool as { needsApproval?: unknown }).needsApproval;
  return needsApproval != null && needsApproval !== false;
}

/**
 * Creates the `HarnessCapabilityUnsupportedError` for a tool that sets
 * `needsApproval`, telling the caller to use the `toolApproval` setting
 * instead of having the tool run without consent.
 */
export function createToolApprovalUnsupportedError(options: {
  /**
   * Identifier of the harness adapter, recorded on the error.
   */
  harnessId?: string;

  /**
   * Name of the tool that requires approval.
   */
  toolName: string;

  /**
   * What the requirement is attached to. Defaults to `'tool'`.
   */
  kind?: ToolApprovalTargetKind;
}): HarnessCapabilityUnsupportedError {
  return new HarnessCapabilityUnsupportedError({
    message: `HarnessAgent: \`needsApproval\` is not supported with HarnessV2; remove it from ${
      options.kind ?? 'tool'
    } '${options.toolName}' and use the \`toolApproval\` setting instead.`,
    harnessId: options.harnessId,
  });
}

/**
 * Throws a `HarnessCapabilityUnsupportedError` for every permission mode but
 * `'allow-all'`, which matches the engine's behavior of running built-in tools
 * without asking. Accepting another mode would run built-in tools that the app
 * expects a user to approve first.
 */
export function assertNoUnsupportedApprovalSettings(options: {
  /**
   * Identifier of the harness adapter, recorded on the error.
   */
  harnessId: string;

  /**
   * The `permissionMode` setting of the agent.
   */
  permissionMode?: string;
}): void {
  if (
    options.permissionMode != null &&
    options.permissionMode !== DEFAULT_PERMISSION_MODE
  ) {
    throw new HarnessCapabilityUnsupportedError({
      message: `HarnessAgent: \`permissionMode: '${options.permissionMode}'\` is not supported with HarnessV2; only 'allow-all' is supported.`,
      harnessId: options.harnessId,
    });
  }
}

/**
 * Throws a `HarnessCapabilityUnsupportedError` when any of the given tools
 * sets `needsApproval`, naming the offending tools so the caller can use the
 * `toolApproval` setting instead of having the tool run without consent.
 */
export function assertNoToolApprovalRequirements(options: {
  /**
   * Identifier of the harness adapter, recorded on the error.
   */
  harnessId: string;

  /**
   * Tools to check.
   */
  tools: ToolSet;

  /**
   * What the tools are. Defaults to `'tool'`.
   */
  kind?: ToolApprovalTargetKind;
}): void {
  const kind = options.kind ?? 'tool';
  const toolNames = Object.entries(options.tools)
    .filter(([, tool]) => requiresApproval(tool))
    .map(([name]) => name);
  if (toolNames.length === 0) return;

  throw new HarnessCapabilityUnsupportedError({
    message: `HarnessAgent: \`needsApproval\` is not supported with HarnessV2; remove it from ${
      toolNames.length === 1
        ? `${kind} '${toolNames[0]}'`
        : `${kind}s ${toolNames.map(name => `'${name}'`).join(', ')}`
    } and use the \`toolApproval\` setting instead.`,
    harnessId: options.harnessId,
  });
}

/**
 * Validates the agent's `toolApproval` setting and normalizes it to object
 * statuses.
 *
 * Only the object form is supported, with an entry per tool of the app's own
 * `tools`. A function (the AI SDK's generic or per-tool approval functions)
 * throws a `HarnessCapabilityUnsupportedError`, since the engine records the
 * statuses with the session and cannot call app code to decide them. An entry
 * for any other tool, e.g. a built-in tool of the harness, and an invalid
 * status throw.
 */
export function normalizeToolApproval(options: {
  /**
   * Identifier of the harness adapter, recorded on errors.
   */
  harnessId: string;

  /**
   * The agent's `toolApproval` setting.
   */
  toolApproval: unknown;

  /**
   * The app's own tools.
   */
  tools: ToolSet;
}): ToolApprovalPolicy {
  const { harnessId, toolApproval, tools } = options;
  if (toolApproval == null) return {};
  if (typeof toolApproval === 'function') {
    throw new HarnessCapabilityUnsupportedError({
      message:
        'HarnessAgent: a `toolApproval` function is not supported with HarnessV2; use an object of statuses by tool name instead.',
      harnessId,
    });
  }
  if (typeof toolApproval !== 'object' || Array.isArray(toolApproval)) {
    throw new Error(
      'HarnessAgent: `toolApproval` must be an object of statuses by tool name.',
    );
  }

  const policy = Object.create(null) as Record<
    string,
    ResolvedToolApprovalStatus
  >;
  for (const [toolName, value] of Object.entries(toolApproval)) {
    if (!Object.hasOwn(tools, toolName)) {
      throw new Error(
        `HarnessAgent: \`toolApproval\` names '${toolName}', which is not one of the agent's \`tools\`.`,
      );
    }
    if (typeof value === 'function') {
      throw new HarnessCapabilityUnsupportedError({
        message: `HarnessAgent: a \`toolApproval\` function for tool '${toolName}' is not supported with HarnessV2; use a status instead.`,
        harnessId,
      });
    }
    const type =
      typeof value === 'string'
        ? value
        : value != null && typeof value === 'object'
          ? (value as { type?: unknown }).type
          : undefined;
    const reason =
      value != null && typeof value === 'object'
        ? (value as { reason?: unknown }).reason
        : undefined;
    if (
      typeof type !== 'string' ||
      !TOOL_APPROVAL_STATUSES.has(type) ||
      (reason !== undefined && typeof reason !== 'string')
    ) {
      throw new Error(
        `HarnessAgent: invalid \`toolApproval\` status for tool '${toolName}'.`,
      );
    }
    policy[toolName] =
      type === 'not-applicable' || reason === undefined
        ? ({ type } as ResolvedToolApprovalStatus)
        : ({ type, reason } as ResolvedToolApprovalStatus);
  }
  return policy;
}

/**
 * Returns the approval status of a tool. Tools without an entry do not
 * require approval.
 */
export function resolveToolApprovalStatus(options: {
  /**
   * The agent's normalized `toolApproval` setting.
   */
  policy: ToolApprovalPolicy;

  /**
   * Name of the called tool.
   */
  toolName: string;
}): ResolvedToolApprovalStatus {
  const { policy, toolName } = options;
  return Object.hasOwn(policy, toolName)
    ? policy[toolName]
    : { type: 'not-applicable' };
}

/**
 * Returns the text a denied tool call passes to the model, including the
 * denial's reason if there is one.
 */
export function describeToolCallDenial(options: {
  /**
   * Reason of the denial, if any.
   */
  reason?: string;
}): string {
  const { reason } = options;
  return reason == null || reason === ''
    ? 'The tool call was denied.'
    : `The tool call was denied: ${reason}`;
}

/**
 * Creates the tool call of an approval request. Approvals are only requested
 * for valid calls of the agent's own tools, which the harness never executes,
 * so the call is dynamic only if its tool is a dynamic tool.
 */
export function createToolApprovalToolCall(options: {
  /**
   * Recorded approval request.
   */
  request: HarnessAgentLogToolApprovalRequestEvent['data'];

  /**
   * The agent's tools.
   */
  tools: ToolSet;
}): TypedToolCall<ToolSet> {
  const { request, tools } = options;
  const toolCall = {
    type: 'tool-call' as const,
    toolCallId: request.toolCallId,
    toolName: request.toolName,
    input: request.input,
  };
  return tools[request.toolName]?.type === 'dynamic'
    ? { ...toolCall, dynamic: true }
    : toolCall;
}

/**
 * Creates the `tool-approval-request` part of a recorded approval request.
 */
export function createToolApprovalRequestPart(options: {
  /**
   * Recorded approval request.
   */
  request: HarnessAgentLogToolApprovalRequestEvent['data'];

  /**
   * The agent's tools.
   */
  tools: ToolSet;
}): ToolApprovalRequestOutput<ToolSet> {
  const { request } = options;
  return {
    type: 'tool-approval-request',
    approvalId: request.approvalId,
    toolCall: createToolApprovalToolCall(options),
    ...(request.reason != null && { reason: request.reason }),
    ...(request.isAutomatic != null && { isAutomatic: request.isAutomatic }),
  };
}

/**
 * Returns whether an approval is waiting for a response: it has neither a
 * response submission nor a response the engine applied.
 */
export function isPendingToolApproval(
  approval: HarnessAgentLogToolApproval,
): boolean {
  return approval.submission == null && approval.response == null;
}

/**
 * Returns the approval responses of a call's input: the
 * `tool-approval-response` parts of the trailing message, if it is a `tool`
 * message. Returns `undefined` when the trailing message is not a `tool`
 * message, so the call is a prompt.
 */
export function collectToolApprovalResponses(options: {
  /**
   * The call's `prompt` option.
   */
  prompt?: string | ModelMessage[];

  /**
   * The call's `messages` option.
   */
  messages?: ModelMessage[];
}): ToolApprovalResponseInput[] | undefined {
  const messages = Array.isArray(options.prompt)
    ? options.prompt
    : options.messages;
  const last = Array.isArray(messages) ? messages.at(-1) : undefined;
  if (last?.role !== 'tool' || !Array.isArray(last.content)) return undefined;
  const responses: ToolApprovalResponseInput[] = [];
  for (const part of last.content) {
    if (part.type !== 'tool-approval-response') continue;
    const response: ToolApprovalResponseInput = {
      approvalId: part.approvalId,
      approved: part.approved,
    };
    if (part.reason != null) response.reason = part.reason;
    responses.push(response);
  }
  return responses;
}

/**
 * Validates approval responses against the session's log and returns the
 * ones to record, in their given order.
 *
 * Responses to approvals that already have a response submission or an
 * applied response are skipped. Throws, naming `functionName`, for:
 *
 * - malformed responses and approval IDs given more than once;
 * - approval IDs the log does not know;
 * - approvals of a turn that is not running anymore, i.e. that is not the
 *   current unfinished turn;
 * - with `requireAll`, any approval of the current turn that is still
 *   waiting for a response after these responses.
 */
export function selectToolApprovalResponses(options: {
  /**
   * Engine log of the session, refreshed.
   */
  log: HarnessAgentLog;

  /**
   * Responses given by the app.
   */
  responses: readonly ToolApprovalResponseInput[];

  /**
   * Whether every approval of the current turn that waits for a response
   * must be answered.
   */
  requireAll: boolean;

  /**
   * Name of the called method, for error messages.
   */
  functionName: string;
}): ToolApprovalResponseInput[] {
  const { log, responses, requireAll, functionName } = options;
  const turn = log.getCurrentTurn();
  const runningTurnId =
    turn != null && turn.finish == null ? turn.start.data.turnId : undefined;
  const seen = new Set<string>();
  const selected: ToolApprovalResponseInput[] = [];
  for (const response of responses) {
    if (
      response == null ||
      typeof response.approvalId !== 'string' ||
      typeof response.approved !== 'boolean' ||
      (response.reason !== undefined && typeof response.reason !== 'string')
    ) {
      throw new Error(
        `HarnessAgent.${functionName}: invalid tool approval response.`,
      );
    }
    if (seen.has(response.approvalId)) {
      throw new Error(
        `HarnessAgent.${functionName}: the tool approval '${response.approvalId}' is answered more than once.`,
      );
    }
    seen.add(response.approvalId);
    const approval = log.getToolApproval({ approvalId: response.approvalId });
    if (approval == null) {
      throw new Error(
        `HarnessAgent.${functionName}: the tool approval '${response.approvalId}' does not exist.`,
      );
    }
    if (!isPendingToolApproval(approval)) continue;
    if (runningTurnId == null || approval.turnId !== runningTurnId) {
      throw new Error(
        `HarnessAgent.${functionName}: the tool approval '${response.approvalId}' belongs to a turn that is not running anymore.`,
      );
    }
    selected.push(
      response.reason === undefined
        ? { approvalId: response.approvalId, approved: response.approved }
        : {
            approvalId: response.approvalId,
            approved: response.approved,
            reason: response.reason,
          },
    );
  }

  if (requireAll && runningTurnId != null) {
    const unanswered = log
      .getToolApprovals({ turnId: runningTurnId })
      .filter(
        approval =>
          isPendingToolApproval(approval) &&
          !seen.has(approval.request.data.approvalId),
      );
    if (unanswered.length > 0) {
      throw new Error(
        `HarnessAgent.${functionName}: every pending tool approval must be answered; missing ${unanswered
          .map(approval => `'${approval.request.data.approvalId}'`)
          .join(', ')}.`,
      );
    }
  }
  return selected;
}
