import type { ChatAddToolApproveResponseFunction, DynamicToolUIPart } from 'ai';

export default function WeatherWithApprovalView({
  invocation,
  addToolApprovalResponse,
}: {
  invocation: DynamicToolUIPart;
  addToolApprovalResponse: ChatAddToolApproveResponseFunction;
}) {
  switch (invocation.state) {
    case 'approval-requested':
      return (
        <div className="text-gray-500">
          Can I execute the tool &quot;{invocation.toolName}&quot; with input{' '}
          {JSON.stringify(invocation.input)}?
          <div>
            <button
              className="px-4 py-2 mr-2 text-white bg-blue-500 rounded transition-colors hover:bg-blue-600"
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
              className="px-4 py-2 text-white bg-red-500 rounded transition-colors hover:bg-red-600"
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
      );
    case 'approval-responded':
      return (
        <div className="text-gray-500">
          Can I execute the tool &quot;{invocation.toolName}&quot; with input{' '}
          {JSON.stringify(invocation.input)}?
          <div>{invocation.approval.approved ? 'Approved' : 'Denied'}</div>
        </div>
      );

    case 'output-available':
      return (
        <div className="text-gray-500">
          Tool {invocation.toolName} with input{' '}
          {JSON.stringify(invocation.input)} executed. Output:{' '}
          {JSON.stringify(invocation.output)}
        </div>
      );
    case 'output-denied':
      return (
        <div className="text-red-500">
          Tool {invocation.toolName} with input{' '}
          {JSON.stringify(invocation.input)} execution denied.
        </div>
      );
    case 'output-error':
      return <div className="text-red-500">Error: {invocation.errorText}</div>;
  }
}
