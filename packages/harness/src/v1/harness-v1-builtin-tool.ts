/**
 * Recommended common names for tools that ship built into the underlying
 * agent runtime. Adapters are encouraged to use one of these when describing
 * a builtin that maps to a familiar capability; any other string is allowed
 * so adapters can describe runtime-specific builtins without forcing them
 * into the common vocabulary.
 */
export const HARNESS_V1_BUILTIN_TOOL_NAMES = [
  'read',
  'write',
  'edit',
  'bash',
  'grep',
  'glob',
  'webSearch',
] as const;

export type HarnessV1BuiltinToolName =
  (typeof HARNESS_V1_BUILTIN_TOOL_NAMES)[number];

/**
 * Descriptor for a tool that the adapter's underlying runtime exposes natively.
 *
 * Pure introspection: declaring a descriptor does not gate or filter tool calls.
 * Adapters keep ownership of how they translate calls to their native runtime.
 */
export type HarnessV1BuiltinToolDescriptor = {
  /**
   * Name as the underlying runtime knows it (e.g. `'Bash'` for Claude Code,
   * `'shell'` for Codex).
   */
  readonly nativeName: string;

  /**
   * Optional cross-harness label drawn from `HARNESS_V1_BUILTIN_TOOL_NAMES`.
   * Set this when the tool maps to a familiar capability; omit it for
   * tools that have no cross-harness equivalent. Consumers can use this
   * to recognize, e.g., that Claude Code's `Bash` and Codex's `shell` are
   * the same kind of tool.
   */
  readonly commonName?: HarnessV1BuiltinToolName;

  /**
   * Optional human-readable description suitable for UIs and debug surfaces.
   */
  readonly description?: string;
};
