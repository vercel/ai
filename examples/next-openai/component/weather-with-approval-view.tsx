import type { WeatherUIToolWithApprovalInvocation } from '@/tool/weather-tool-with-approval';

export default function WeatherWithApprovalView({
  invocation,
  sendApprovalResponse,
}: {
  invocation: WeatherUIToolWithApprovalInvocation;
  sendApprovalResponse: (response: {
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
          Weather in {invocation.input.city}: {invocation.output.weather}
        </div>
      );
    case 'output-error':
      return <div className="text-red-500">Error: {invocation.errorText}</div>;
  }
}
