import { JSONSchema7 } from 'json-schema';
import { SharedV3ProviderOptions } from '../../shared';

/**
A tool has a name, a description, and a set of parameters.

Note: this is **not** the user-facing tool definition. The AI SDK methods will
map the user-facing tool definitions to this format.
 */
export type LanguageModelV3FunctionTool = {
  /**
The type of the tool (always 'function').
   */
  type: 'function';

  /**
The name of the tool. Unique within this model call.
   */
  name: string;

  /**
A description of the tool. The language model uses this to understand the
tool's purpose and to provide better completion suggestions.
   */
  description?: string;

  /**
The parameters that the tool expects. The language model uses this to
understand the tool's input requirements and to provide matching suggestions.
   */
  inputSchema: JSONSchema7;

  /**
   * Strict mode setting for the tool.
   *
   * Providers that support strict mode will use this setting to determine
   * how the input should be generated. Strict mode will always produce
   * valid inputs, but it might limit what input schemas are supported.
   */
  strict: boolean | undefined;

  /**
The provider-specific options for the tool.
   */
  providerOptions?: SharedV3ProviderOptions;
};
