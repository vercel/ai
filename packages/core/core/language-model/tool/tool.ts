import { z } from 'zod';

/**
 * A tool contains the description and the schema of the input that the tool expects.
 * This enables the language model to generate the input.
 *
 * The tool can also contain an optional execute function for the actual execution function of the tool.
 */
export interface Tool<PARAMETERS extends z.ZodTypeAny = any, RESULT = any> {
  /**
   * A optional description of what the tool does. Will be used by the language model to decide whether to use the tool.
   */
  description?: string;

  /**
   * The schema of the input that the tool expects. The language model will use this to generate the input.
   * Use descriptions to make the input understandable for the language model.
   */
  parameters: PARAMETERS;

  /**
   * An optional execute function for the actual execution function of the tool.
   * If not provided, the tool will not be executed automatically.
   */
  execute?: (args: z.infer<PARAMETERS>) => PromiseLike<RESULT>;
}

/**
 * Helper function for inferring the execute args of a tool.
 */
export function tool<PARAMETERS extends z.ZodTypeAny, RESULT = any>(
  tool: Tool<PARAMETERS, RESULT>,
) {
  return tool;
}
