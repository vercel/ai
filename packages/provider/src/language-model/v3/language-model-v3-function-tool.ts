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
The provider-specific options for the tool.
   */
  providerOptions?: SharedV3ProviderOptions;

  /**
When true, the tool's full definition is deferred and not loaded into context
initially. The tool can be dynamically discovered through a tool search mechanism.
This reduces token usage when you have many tools.

@experimental This feature is experimental and may change in future versions.
Requires the Tool Search Tool to be enabled.
   */
  deferLoading?: boolean;

  /**
Specifies which callers are allowed to invoke this tool.
When set to ['code_execution_20250825'], the tool can only be called from
within code execution contexts, enabling programmatic tool orchestration.

@experimental This feature is experimental and may change in future versions.
Requires the Code Execution Tool to be enabled.
   */
  allowedCallers?: string[];

  /**
Example inputs that demonstrate how to use the tool correctly.
These examples help the model understand proper parameter formats,
conventions, and usage patterns beyond what JSON Schema can express.

@experimental This feature is experimental and may change in future versions.
   */
  inputExamples?: unknown[];
};
