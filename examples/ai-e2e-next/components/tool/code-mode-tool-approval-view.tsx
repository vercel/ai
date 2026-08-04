import type { CodeModeToolApprovalMessage } from '@/agent/code-mode/code-mode-tool-approval-agent';
import type { ChatAddToolApproveResponseFunction } from 'ai';

type CodeModeApprovalToolPart = Extract<
  CodeModeToolApprovalMessage['parts'][number],
  {
    type:
      | 'tool-codeMode'
      | 'tool-getProductPrice'
      | 'tool-checkProductInventory'
      | 'tool-getCustomerDiscount'
      | 'tool-getShippingCost'
      | 'tool-purchaseProduct';
  }
>;

const toolTitles: Record<CodeModeApprovalToolPart['type'], string> = {
  'tool-codeMode': 'Code Mode',
  'tool-getProductPrice': 'Get Product Price',
  'tool-checkProductInventory': 'Check Product Inventory',
  'tool-getCustomerDiscount': 'Get Customer Discount',
  'tool-getShippingCost': 'Get Shipping Cost',
  'tool-purchaseProduct': 'Purchase Product',
};

export default function CodeModeToolApprovalView({
  invocation,
  addToolApprovalResponse,
}: {
  invocation: CodeModeApprovalToolPart;
  addToolApprovalResponse: ChatAddToolApproveResponseFunction;
}) {
  const title = toolTitles[invocation.type];

  return (
    <div className="p-4 mb-3 bg-white rounded-xl border border-gray-300 shadow-sm">
      <div className="mb-3 text-sm font-semibold text-gray-900">{title}</div>

      {invocation.input != null ? (
        <div className="mb-3">
          <div className="mb-1 text-xs font-medium text-gray-600">Input</div>
          <pre className="overflow-x-auto p-3 text-xs text-gray-100 whitespace-pre-wrap bg-gray-900 rounded-lg">
            {formatValue(invocation.input)}
          </pre>
        </div>
      ) : (
        <div className="mb-3 text-sm text-gray-500">Generating input...</div>
      )}

      {invocation.state === 'approval-requested' ? (
        <div>
          <div className="mb-3 text-sm text-amber-700">
            Approval is required before this tool can run.
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
              onClick={() =>
                addToolApprovalResponse({
                  id: invocation.approval.id,
                  approved: true,
                })
              }
            >
              Approve
            </button>
            <button
              type="button"
              className="px-4 py-2 text-sm text-white bg-red-600 rounded hover:bg-red-700"
              onClick={() =>
                addToolApprovalResponse({
                  id: invocation.approval.id,
                  approved: false,
                })
              }
            >
              Deny
            </button>
          </div>
        </div>
      ) : invocation.state === 'approval-responded' ? (
        <div
          className={
            invocation.approval.approved
              ? 'text-sm font-medium text-green-700'
              : 'text-sm font-medium text-red-700'
          }
        >
          {invocation.approval.approved ? 'Approved' : 'Denied'}
        </div>
      ) : invocation.state === 'output-available' ? (
        <div>
          <div className="mb-1 text-xs font-medium text-gray-600">Output</div>
          <pre className="overflow-x-auto p-3 text-xs text-gray-900 whitespace-pre-wrap bg-gray-100 rounded-lg">
            {formatValue(invocation.output)}
          </pre>
        </div>
      ) : invocation.state === 'output-denied' ? (
        <div className="text-sm font-medium text-red-700">
          Execution was denied.
        </div>
      ) : invocation.state === 'output-error' ? (
        <div className="text-sm text-red-700">
          Error: {invocation.errorText}
        </div>
      ) : (
        <div className="text-sm text-gray-500">Preparing tool call...</div>
      )}
    </div>
  );
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }

  return JSON.stringify(value, null, 2) ?? String(value);
}
