/**
The configuration of a tool that is defined by the provider.
 */
export type LanguageModelV2ProviderDefinedTool = {
  /**
The type of the tool (always 'provider-defined').
   */
  type: 'provider-defined';

  /**
The ID of the tool. Should follow the format `<provider-name>.<tool-name>`.
   */
  id: `${string}.${string}`;

  /**
The name of the tool. Unique within this model call.
   */
  name: string;

  /**
The arguments for configuring the tool. Must match the expected arguments defined by the provider for this tool.
  */
  args: Record<string, unknown>;

  /**
Optional execution mode for server-side tools.
'server' means the tool is executed on the provider's servers.
'hybrid' means the tool may be executed server-side or client-side based on provider capabilities.
Defaults to 'server' for provider-defined tools.
   */
  executionMode?: 'server' | 'hybrid';

  /**
Optional result schema for server-side tools to enable type checking of results.
This helps with tool composition and result validation.
   */
  resultSchema?: Record<string, unknown>;

  /**
Optional capabilities that this server-side tool supports.
Used by providers to communicate tool limitations or special features.
   */
  capabilities?: {
    /**
Whether the tool supports streaming results.
     */
    streaming?: boolean;

    /**
Whether the tool supports cancellation during execution.
     */
    cancellable?: boolean;

    /**
Maximum execution time in milliseconds for server-side execution.
     */
    maxExecutionTime?: number;

    /**
Whether the tool requires special permissions or setup.
     */
    requiresSetup?: boolean;
  };
};
