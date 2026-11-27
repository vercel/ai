import type { HarnessV2ToolSpec } from '@ai-sdk/harness';
import type { JSONSchema7 } from '@ai-sdk/provider';
import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';

/**
 * Pi tool of one of the app's own tools. Its input schema is a JSON Schema,
 * so Pi passes the validated input as `unknown`.
 */
export type PiHostAgentTool = AgentTool<JSONSchema7, unknown>;

/**
 * Creates the Pi tool for one of the app's own tools, from its turn tool
 * spec. The tool's input schema is passed to Pi as is (a tool without one
 * accepts any object), and `execute` runs the call through the host.
 */
export function createPiHostAgentTool(options: {
  /**
   * Tool spec from the turn settings.
   */
  spec: HarnessV2ToolSpec;

  /**
   * Executes a call of the tool and returns the result Pi places in the
   * transcript. Throwing makes Pi place an error result with the message.
   */
  execute: (call: {
    /**
     * ID of the tool call.
     */
    toolCallId: string;

    /**
     * Arguments of the call, validated against the input schema by Pi.
     */
    input: unknown;
  }) => Promise<AgentToolResult<unknown>>;
}): PiHostAgentTool {
  const { spec, execute } = options;
  return {
    name: spec.name,
    label: spec.name,
    description: spec.description ?? '',
    parameters: spec.inputSchema ?? { type: 'object' },
    execute: (toolCallId, input) => execute({ toolCallId, input }),
  };
}
