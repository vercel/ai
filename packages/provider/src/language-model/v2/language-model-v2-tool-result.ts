import { SharedV2ProviderMetadata } from '../../shared/v2/shared-v2-provider-metadata';

/**
Tool result that has been executed server-side by the provider.
 */
export type LanguageModelV2ToolResult = {
  type: 'tool-result';

  /**
   * The ID of the tool call that this result is associated with.
   */
  toolCallId: string;

  /**
   * Name of the tool that generated this result.
   */
  toolName: string;

  /**
   * Result of the tool call. This is a JSON-serializable object.
   */
  result: unknown;

  /**
   * Optional flag if the result is an error or an error message.
   */
  isError?: boolean;

  /**
   * Additional provider-specific metadata for the tool result.
   */
  providerMetadata?: SharedV2ProviderMetadata;
};
