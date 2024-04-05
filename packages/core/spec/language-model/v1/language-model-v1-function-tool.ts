import { JSONSchema7 } from 'json-schema';

/**
A tool has a name, a description, and a set of parameters.

Note: this is **not** the user-facing tool definition. The AI SDK methods will
map the user-facing tool definitions to this format.
 */
export type LanguageModelV1FunctionTool = {
  /**
The type of the tool. Only functions for now, but this gives us room to
add more specific tool types in the future and use a discriminated union.
   */
  type: 'function';

  /**
The name of the tool. Unique within this model call.
   */
  name: string;

  description?: string;

  parameters: JSONSchema7;
};
