import { SharedV3ProviderMetadata } from '../../shared/v3/shared-v3-provider-metadata';

/**
 * Tool approval requests that the model has generated.
 *
 * Tool approval requests are only supported for provider-executed tools.
 */
export type LanguageModelV3ToolApprovalRequest = {
  type: 'tool-approval-request';

  /**
   * ID of the tool approval.
   */
  approvalId: string;

  /**
   * ID of the tool call that the approval request is for.
   */
  toolCallId: string;

  /**
   * Additional provider-specific metadata for the tool approval request.
   */
  providerMetadata?: SharedV3ProviderMetadata;
};
