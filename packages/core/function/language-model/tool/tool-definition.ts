import { Schema } from '../../schema/schema';

/**
 * A tool definition contains all information required for a language model to generate tool calls.
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
  parameters: Schema<PARAMETERS>;
}
