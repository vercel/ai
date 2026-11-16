import type { Tool, ToolSet } from '@ai-sdk/provider-utils';
import { HarnessCapabilityUnsupportedError } from '../../../errors/harness-capability-unsupported-error';

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
}): void {
  const toolNames = Object.entries(options.tools)
    .filter(([, tool]) => requiresApproval(tool))
    .map(([name]) => name);
  if (toolNames.length === 0) return;

  throw new HarnessCapabilityUnsupportedError({
    message: `HarnessAgent: tool approval is not supported with HarnessV2; remove \`needsApproval\` from ${
      toolNames.length === 1
        ? `tool '${toolNames[0]}'`
        : `tools ${toolNames.map(name => `'${name}'`).join(', ')}`
    }.`,
    harnessId: options.harnessId,
  });
}
