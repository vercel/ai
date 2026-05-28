import type { claudeCode } from '@ai-sdk/harness-claude-code';
import type { UIToolInvocation } from 'ai';

type BashInvocation = UIToolInvocation<typeof claudeCode.builtinTools.bash>;

export default function HarnessBashView({
  invocation,
}: {
  invocation: BashInvocation;
}) {
  const command = invocation.input?.command ?? '';

  switch (invocation.state) {
    case 'input-streaming':
    case 'input-available':
      return (
        <div className="p-2 mb-2 bg-white rounded-xl border border-gray-300 shadow-lg">
          <div className="px-6 py-3 bg-gray-100 rounded-t-xl border-b border-gray-300">
            <div className="overflow-hidden tracking-wide text-black whitespace-nowrap text-xxs font-small text-ellipsis">
              Running Shell Command
            </div>
          </div>
          <div className="p-6">
            <pre className="overflow-x-auto p-4 text-sm text-black whitespace-pre-wrap bg-gray-100 rounded-lg border border-gray-300">
              {command}
            </pre>
          </div>
        </div>
      );

    case 'output-available': {
      const output = invocation.output;
      const isString = typeof output === 'string';
      const stdout = isString
        ? output
        : typeof (output as Record<string, unknown>)?.stdout === 'string'
          ? ((output as Record<string, unknown>).stdout as string)
          : undefined;
      const stderr =
        !isString &&
        typeof (output as Record<string, unknown>)?.stderr === 'string'
          ? ((output as Record<string, unknown>).stderr as string)
          : undefined;
      const exitCodeRaw = !isString
        ? (output as Record<string, unknown>)?.exitCode
        : undefined;
      const exitCode =
        typeof exitCodeRaw === 'number' ? exitCodeRaw : undefined;

      return (
        <div className="p-2 mb-2 bg-white rounded-xl border border-gray-300 shadow-lg">
          <div className="px-6 py-3 bg-gray-100 rounded-t-xl border-b border-gray-300">
            <div className="overflow-hidden tracking-wide text-black whitespace-nowrap text-xxs font-small text-ellipsis">
              Shell Execution Result
            </div>
          </div>

          <div className="p-6 space-y-2">
            <div>
              <div className="mb-2 text-sm font-medium text-black">
                Command:
              </div>
              <pre className="overflow-x-auto p-4 text-sm text-black whitespace-pre-wrap bg-gray-100 rounded-lg border border-gray-300">
                {command}
              </pre>
            </div>

            {exitCode !== undefined && exitCode !== 0 && (
              <div className="p-3 bg-red-50 border border-red-300 rounded-lg">
                <div className="text-sm font-medium text-red-600">
                  Exit Code: {exitCode}
                </div>
              </div>
            )}

            {stdout && (
              <div>
                <div className="mb-2 text-sm font-medium text-black">
                  Output:
                </div>
                <pre className="overflow-x-auto p-3 font-mono text-sm text-black whitespace-pre-wrap bg-gray-100 rounded-lg border border-gray-300">
                  {stdout}
                </pre>
              </div>
            )}

            {stderr && (
              <div>
                <div className="mb-2 text-sm font-medium text-black">
                  Error:
                </div>
                <pre className="overflow-x-auto p-3 font-mono text-sm text-red-600 whitespace-pre-wrap bg-red-50 rounded-lg border border-red-300">
                  {stderr}
                </pre>
              </div>
            )}
          </div>
        </div>
      );
    }

    case 'output-denied':
      return (
        <div className="p-2 mb-2 bg-white rounded-xl border border-gray-300 shadow-lg">
          <div className="p-6">
            <div className="mb-2 text-sm font-medium text-black">Command:</div>
            <pre className="overflow-x-auto p-4 text-sm text-black whitespace-pre-wrap bg-gray-100 rounded-lg border border-gray-300">
              {command}
            </pre>
            <div className="mt-4 text-sm font-medium text-red-600">
              Execution was denied by user.
            </div>
          </div>
        </div>
      );

    case 'output-error':
      return (
        <div className="p-2 mb-2 bg-red-50 rounded-xl border border-red-300 shadow-lg">
          <div className="p-6">
            <div className="mb-2 text-sm font-medium text-red-600">Error:</div>
            <div className="text-sm text-black">{invocation.errorText}</div>
          </div>
        </div>
      );
  }
}
