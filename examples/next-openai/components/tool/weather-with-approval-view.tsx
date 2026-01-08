import type { WeatherUIToolWithApprovalInvocation } from '@/tool/weather-tool-with-approval';
import type { ChatAddToolApproveResponseFunction } from 'ai';

export default function WeatherWithApprovalView({
  invocation,
  addToolApprovalResponse,
}: {
  invocation: WeatherUIToolWithApprovalInvocation;
  addToolApprovalResponse: ChatAddToolApproveResponseFunction;
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
              Deny
            </button>
          </div>
        </div>
      );
    case 'approval-responded':
      return (
        <div className="text-gray-500">
          Can I retrieve the weather for {invocation.input.city}?
          <div>{invocation.approval.approved ? 'Approved' : 'Denied'}</div>
        </div>
      );

    case 'output-available':
      return (
        <div className="text-gray-500">
          {invocation.output.state === 'loading'
            ? 'Fetching weather information...'
            : `Weather in ${invocation.input.city}: ${invocation.output.weather}`}
        </div>
      );
    case 'output-denied':
      return (
        <div className="text-gray-500">
          Weather in {invocation.input.city}:{' '}
          <span className="text-red-500">Tool execution denied.</span>
        </div>
      );
    case 'output-error':
      return <div className="text-red-500">Error: {invocation.errorText}</div>;
  }
}
