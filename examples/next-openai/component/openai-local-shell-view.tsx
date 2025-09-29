import { openai } from '@ai-sdk/openai';
import { UIToolInvocation } from 'ai';

export default function LocalShellView({
  invocation,
}: {
  invocation: UIToolInvocation<ReturnType<typeof openai.tools.localShell>>;
}) {
  const action = invocation.input?.action;
  const command = action?.command?.join(' ') || '';

  return (
    <div className="mb-2 bg-gray-900 rounded-xl border border-gray-600 shadow-lg p-2">
      <div className="px-6 py-3 bg-gray-800 rounded-t-xl border-b border-gray-700">
        <div className="overflow-hidden tracking-wide text-gray-500 whitespace-nowrap text-xxs font-small text-ellipsis">
          Local Shell Execution
        </div>
      </div>

      <div className="p-6">
        <div className="mb-3">
          <div className="mb-2 text-sm font-medium text-blue-400">
            Command:
          </div>
          <pre className="overflow-x-auto p-4 text-sm text-gray-100 whitespace-pre-wrap bg-black rounded-lg">
            {command}
          </pre>
        </div>

        {action?.workingDirectory && (
          <div className="mb-3">
            <div className="mb-2 text-sm font-medium text-gray-400">
              Working Directory:
            </div>
            <div className="p-3 text-sm text-gray-300 bg-black rounded-lg font-mono">
              {action.workingDirectory}
            </div>
          </div>
        )}

        {action?.user && (
          <div className="mb-3">
            <div className="mb-2 text-sm font-medium text-gray-400">User:</div>
            <div className="p-3 text-sm text-gray-300 bg-black rounded-lg font-mono">
              {action.user}
            </div>
          </div>
        )}

        {action?.timeoutMs && (
          <div className="mb-3">
            <div className="mb-2 text-sm font-medium text-gray-400">
              Timeout:
            </div>
            <div className="p-3 text-sm text-gray-300 bg-black rounded-lg font-mono">
              {action.timeoutMs}ms
            </div>
          </div>
        )}

        {action?.env && Object.keys(action.env).length > 0 && (
          <div className="mb-3">
            <div className="mb-2 text-sm font-medium text-gray-400">
              Environment Variables:
            </div>
            <div className="p-3 text-sm text-gray-300 bg-black rounded-lg font-mono">
              {Object.entries(action.env).map(([key, value]) => (
                <div key={key}>
                  {key}={value}
                </div>
              ))}
            </div>
          </div>
        )}

        {invocation.state === 'output-available' && (
          <div className="mb-3">
            <div className="mb-2 text-sm font-medium text-yellow-400">
              Output:
            </div>
            <div className="space-y-2">
              <div className="p-3 bg-black rounded-lg">
                <div className="font-mono text-sm text-green-300">
                  <span className="whitespace-pre-wrap">
                    {invocation.output.output}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
