/**
 * Tool approval response prompt part.
 */
export type ToolApprovalResponse = {
  type: 'tool-approval-response';

  /**
   * ID of the tool approval.
   */
  approvalId: string;

  /**
   * Flag indicating whether the approval was granted or denied.
   */
  approved: boolean;

  /**
   * Optional reason for the approval or denial.
   *
   * For denied tool calls, the reason is included in the `execution-denied`
   * tool result that is sent to the model. For approved tool calls that are
   * executed by the SDK, the reason remains in the message history: it is not
   * included in the model prompt and is not exposed through a dedicated tool
   * execution option. For provider-executed tools, the approval response
   * (including the reason) is forwarded to the provider.
   */
  reason?: string;

  /**
   * Flag indicating whether the tool call is provider-executed.
   * Only provider-executed tool approval responses should be sent to the model.
   */
  providerExecuted?: boolean;
};
