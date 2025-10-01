import type { WeatherUIToolWithApprovalInvocation } from '@/tool/weather-tool-with-approval';

export default function WeatherWithApprovalView({
  invocation,
  addToolApprovalResponse,
}: {
  invocation: WeatherUIToolWithApprovalInvocation;
  addToolApprovalResponse: (response: {
    id: string;
    approved: boolean;
    reason?: string;
  }) => void;
}) {
  switch (invocation.state) {
    case 'approval-requested':
      return (
        <div className="text-gray-500">
          Can I retrieve the weather for {invocation.input.city}?
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
              Reject
            </button>
          </div>
        </div>
      );
    case 'approval-responded':
    case 'output-denied':
      return (
        <div className="text-gray-500">
          Can I retrieve the weather for {invocation.input.city}?
          {invocation.approval.approved ? 'Approved' : 'Rejected'}
        </div>
      );
    case 'output-available':
      return (
        <div className="text-gray-500">
          Weather in {invocation.input.city}: {invocation.output.weather}
        </div>
      );
    case 'output-error':
      return <div className="text-red-500">Error: {invocation.errorText}</div>;
  }
}
