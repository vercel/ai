import { z } from 'zod';
/**
 * A tool contains the description and the schema of the input that the tool expects.
 * This enables the language model to generate the input.
 *
 * The tool can also contain an optional execute function for the actual execution function of the tool.
 */
export interface Tool<PARAMETERS, RESULT> {
  /**
   * A optional description of what the tool does. Will be used by the language model to decide whether to use the tool.
   */
  description?: string;

  /**
   * The schema of the input that the tool expects. The language model will use this to generate the input.
   * Use descriptions to make the input understandable for the language model.
   */
  parameters: z.ZodType<PARAMETERS, any, any>; // using ZodType to enable type inference

  /**
   * An optional schema of the output that the tool produces. This will be used to validate the output.
   */
  returnType?: z.Schema<RESULT>;

  /**
   * An optional execute function for the actual execution function of the tool.
   * If not provided, the tool will not be executed automatically.
   */
  execute?: (args: PARAMETERS) => PromiseLike<RESULT>;
}
