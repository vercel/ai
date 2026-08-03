import { runManagedCodeMode } from './runtime/manager.js';
import type { RunCodeModeInput } from './types.js';

/**
 * Runs one code-mode invocation directly without wrapping it as an AI SDK tool.
 *
 * The source is executed in a fresh QuickJS context with the provided host tools
 * and execution limits.
 *
 * @param input - Source code, host tools, forwarded tool execution options, and code-mode options.
 * @returns The JSON-serializable value returned by the sandboxed program.
 */
export async function runCodeMode(input: RunCodeModeInput): Promise<unknown> {
  return await runManagedCodeMode(input);
}
