import { useState } from 'react';
import type { WeatherUIToolWithApprovalInvocation } from '@/tool/weather-tool-with-approval';
import type { ChatAddToolApproveResponseFunction } from 'ai';

export default function WeatherWithApprovalView({
  invocation,
  addToolApprovalResponse,
}: {
  invocation: WeatherUIToolWithApprovalInvocation;
  addToolApprovalResponse: ChatAddToolApproveResponseFunction;
}) {
  const [city, setCity] = useState(invocation.input?.city ?? '');

  switch (invocation.state) {
    case 'approval-requested':
      return (
        <div className="text-gray-500">
          <div>Can I retrieve the weather for {invocation.input.city}?</div>
          {invocation.approval.allowsInputEditing && (
            <input
              value={city}
              onChange={e => setCity(e.target.value)}
              className="mt-2 px-2 py-1 border rounded"
            />
          )}
          <div className="mt-2">
            <button
              className="px-4 py-2 mr-2 text-white bg-blue-500 rounded transition-colors hover:bg-blue-600"
              onClick={() => {
                const trimmed = city?.trim();
                addToolApprovalResponse({
                  id: invocation.approval.id,
                  approved: true,
                  override:
                    trimmed && trimmed !== invocation.input.city
                      ? { input: { city: trimmed } }
                      : undefined,
                });
              }}
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
          Can I retrieve the weather for{' '}
          {invocation.approval.override?.input.city ?? invocation.input.city}?
          <div>{invocation.approval.approved ? 'Approved' : 'Denied'}</div>
        </div>
      );

    case 'output-available':
      return (
        <div className="text-gray-500">
          {invocation.output.state === 'loading'
            ? 'Fetching weather information...'
            : `Weather in ${invocation.approval?.override?.input.city ?? invocation.input.city}: ${invocation.output.weather}`}
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
