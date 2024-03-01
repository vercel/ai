import { z } from 'zod';

/**
 * A tool definition contains a description of the tool and the schema of the input that the tool expects.
 * The tool name is provided by the tools mapping.
 */
export interface ToolDefinition<NAME extends string, PARAMETERS> {
  /**
   * The name of the tool.
   * Should be understandable for language models and unique among the tools that they know.
   *
   * Note: Using generics to enable result type inference when there are multiple tool calls.
   */
  name: NAME;

  /**
   * A optional description of what the tool does. Will be used by the language model to decide whether to use the tool.
   */
  description?: string;

  /**
   * The schema of the input that the tool expects. The language model will use this to generate the input.
   * Use descriptions to make the input understandable for the language model.
   */
  parameters: z.Schema<PARAMETERS>;
}
