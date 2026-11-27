import type { Tool, ToolSet } from '@ai-sdk/provider-utils';

/**
 * A built-in tool whose approval is controlled by harness permissions rather
 * than by a per-tool approval requirement.
 */
export type HarnessV2BuiltinTool<INPUT = unknown, OUTPUT = unknown> = Readonly<
  Tool<INPUT, OUTPUT> & {
    /**
     * Approval is handled by the broader harness permission configuration,
     * not by per-built-in-tool approval definitions.
     */
    needsApproval?: never;
  }
>;

/**
 * Read-only declarations of the tools implemented by a harness adapter.
 */
export type HarnessV2BuiltinToolSet = Readonly<
  Record<
    string,
    Readonly<ToolSet[string] & Pick<HarnessV2BuiltinTool, 'needsApproval'>>
  >
>;
