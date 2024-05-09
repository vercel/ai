import { z } from 'zod';

/**
A tool contains the description and the schema of the input that the tool expects.
This enables the language model to generate the input.

The tool can also contain an optional execute function for the actual execution function of the tool.
 */
export interface CoreTool<PARAMETERS extends z.ZodTypeAny = any, RESULT = any> {
  /**
An optional description of what the tool does. Will be used by the language model to decide whether to use the tool.
   */
  description?: string;

  /**
The schema of the input that the tool expects. The language model will use this to generate the input.
It is also used to validate the output of the language model. 
Use descriptions to make the input understandable for the language model.
   */
  parameters: PARAMETERS;

  /**
An async function that is called with the arguments from the tool call and produces a result. 
If not provided, the tool will not be executed automatically.
   */
  execute?: (args: z.infer<PARAMETERS>) => PromiseLike<RESULT>;
}

/**
Helper function for inferring the execute args of a tool.
 */
// Note: special type inference is needed for the execute function args to make sure they are inferred correctly.
export function tool<PARAMETERS extends z.ZodTypeAny, RESULT>(
  tool: CoreTool<PARAMETERS, RESULT> & {
    execute: (args: z.infer<PARAMETERS>) => PromiseLike<RESULT>;
  },
): CoreTool<PARAMETERS, RESULT> & {
  execute: (args: z.infer<PARAMETERS>) => PromiseLike<RESULT>;
};
export function tool<PARAMETERS extends z.ZodTypeAny, RESULT>(
  tool: CoreTool<PARAMETERS, RESULT> & {
    execute?: undefined;
  },
): CoreTool<PARAMETERS, RESULT> & {
  execute: undefined;
};
export function tool<PARAMETERS extends z.ZodTypeAny, RESULT = any>(
  tool: CoreTool<PARAMETERS, RESULT>,
): CoreTool<PARAMETERS, RESULT> {
  return tool;
}

/**
 * @deprecated Use `CoreTool` instead.
 */
export type ExperimentalTool = CoreTool;
