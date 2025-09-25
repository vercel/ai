import type { WeatherUIToolInvocation } from '@/tool/weather-tool';

export default function WeatherView({
  invocation,
  sendApprovalResponse,
}: {
  invocation: WeatherUIToolInvocation;
  sendApprovalResponse: (response: {
    id: string;
    approved: boolean;
    reason?: string;
  }) => void;
}) {
  switch (invocation.state) {
    // example of pre-rendering streaming tool calls:
    case 'input-streaming':
      return <pre>{JSON.stringify(invocation.input, null, 2)}</pre>;
    case 'input-available':
      return (
        <div className="text-gray-500">
          Getting weather information for {invocation.input.city}...
        </div>
      );
    case 'approval-requested':
      return (
        <div className="text-gray-500">
          Can I retrieve the weather for {invocation.input.city}?
          <button
            onClick={() =>
              sendApprovalResponse({
                id: invocation.approval.id,
                approved: true,
              })
            }
          >
            Approve
          </button>
          <button
            onClick={() =>
              sendApprovalResponse({
                id: invocation.approval.id,
                approved: false,
              })
            }
          >
            Reject
          </button>
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
          {invocation.output.state === 'loading'
            ? 'Fetching weather information...'
            : `Weather in ${invocation.input.city}: ${invocation.output.weather}`}
        </div>
      );
    case 'output-error':
      return <div className="text-red-500">Error: {invocation.errorText}</div>;
  }
}
