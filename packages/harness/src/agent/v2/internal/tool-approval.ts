import type { Tool, ToolSet } from '@ai-sdk/provider-utils';
import { HarnessCapabilityUnsupportedError } from '../../../errors/harness-capability-unsupported-error';

/**
 * What an approval requirement is attached to: one of the app's own tools, or
 * one of the harness adapter's built-in tools.
 */
export type ToolApprovalTargetKind = 'tool' | 'built-in tool';

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
 * Creates the `HarnessCapabilityUnsupportedError` for a tool that requires
 * approval, telling the caller to remove `needsApproval` instead of having the
 * tool run without consent.
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
    message: `HarnessAgent: tool approval is not supported with HarnessV2; remove \`needsApproval\` from ${
      options.kind ?? 'tool'
    } '${options.toolName}'.`,
    harnessId: options.harnessId,
  });
}

/**
 * Throws a `HarnessCapabilityUnsupportedError` for approval settings that the v2
 * engine cannot honor: the `toolApproval` setting and every permission mode but
 * `'allow-all'`, which matches the engine's behavior of running tools without
 * asking. Accepting them would run tools that the app expects a user to approve
 * first.
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

  /**
   * The `toolApproval` setting of the agent.
   */
  toolApproval?: unknown;
}): void {
  if (options.toolApproval != null) {
    throw new HarnessCapabilityUnsupportedError({
      message:
        'HarnessAgent: `toolApproval` is not supported with HarnessV2; remove it or use a HarnessV1 adapter.',
      harnessId: options.harnessId,
    });
  }
  if (
    options.permissionMode != null &&
    options.permissionMode !== 'allow-all'
  ) {
    throw new HarnessCapabilityUnsupportedError({
      message: `HarnessAgent: \`permissionMode: '${options.permissionMode}'\` is not supported with HarnessV2; only 'allow-all' is supported.`,
      harnessId: options.harnessId,
    });
  }
}

/**
 * Throws a `HarnessCapabilityUnsupportedError` when any of the given tools
 * requires approval, naming the offending tools so the caller can remove
 * `needsApproval` instead of having the tool run without consent.
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
    message: `HarnessAgent: tool approval is not supported with HarnessV2; remove \`needsApproval\` from ${
      toolNames.length === 1
        ? `${kind} '${toolNames[0]}'`
        : `${kind}s ${toolNames.map(name => `'${name}'`).join(', ')}`
    }.`,
    harnessId: options.harnessId,
  });
}
