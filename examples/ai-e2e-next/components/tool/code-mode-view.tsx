import type { CodeModeTool } from '@ai-sdk/code-mode';
import type { UIToolInvocation } from 'ai';

type CodeModeInvocation = UIToolInvocation<CodeModeTool>;

export default function CodeModeView({
  invocation,
}: {
  invocation: CodeModeInvocation;
}) {
  return (
    <div className="mb-2 bg-gray-900 rounded-xl border border-gray-600 shadow-lg">
      <div className="px-4 py-3 bg-gray-800 rounded-t-xl border-b border-gray-700">
        <span className="text-sm font-semibold text-blue-300">Code Mode</span>
      </div>

      <div className="p-4">
        <div className="mb-2 text-sm font-medium text-blue-400">
          Generated TypeScript:
        </div>
        <pre className="overflow-x-auto p-4 text-sm text-gray-100 whitespace-pre-wrap bg-black rounded-lg">
          {invocation.input?.js ?? 'Generating code...'}
        </pre>

        {invocation.state === 'output-available' && (
          <div className="mt-4">
            <div className="mb-2 text-sm font-medium text-green-400">
              Result:
            </div>
            <pre className="overflow-x-auto p-4 text-sm text-green-200 whitespace-pre-wrap bg-black rounded-lg">
              {formatOutput(invocation.output)}
            </pre>
          </div>
        )}

        {invocation.state === 'output-error' && (
          <div className="mt-4 text-sm text-red-300">
            Code mode error: {invocation.errorText}
          </div>
        )}
      </div>
    </div>
  );
}

function formatOutput(output: unknown): string {
  if (typeof output === 'string') {
    return output;
  }

  return JSON.stringify(output, null, 2) ?? String(output);
}
