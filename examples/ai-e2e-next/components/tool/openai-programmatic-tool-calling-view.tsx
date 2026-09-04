import type { openai } from '@ai-sdk/openai';
import type { UIToolInvocation } from 'ai';

type ProgramInvocation = UIToolInvocation<
  ReturnType<typeof openai.tools.programmaticToolCalling>
>;

export default function OpenAIProgrammaticToolCallingView({
  invocation,
}: {
  invocation: ProgramInvocation;
}) {
  return (
    <div className="mb-2 bg-gray-900 rounded-xl border border-gray-600 shadow-lg">
      <div className="px-4 py-3 bg-gray-800 rounded-t-xl border-b border-gray-700">
        <span className="text-sm font-semibold text-blue-300">
          OpenAI Programmatic Tool Calling
        </span>
      </div>

      <div className="p-4">
        <div className="mb-2 text-sm font-medium text-blue-400">
          Generated JavaScript:
        </div>
        <pre className="overflow-x-auto p-4 text-sm text-gray-100 whitespace-pre-wrap bg-black rounded-lg">
          {invocation.input?.code ?? 'Generating program...'}
        </pre>

        {invocation.state === 'output-available' && (
          <div className="mt-4">
            <div className="mb-2 text-sm font-medium text-green-400">
              Program output ({invocation.output.status}):
            </div>
            <pre className="overflow-x-auto p-4 text-sm text-green-200 whitespace-pre-wrap bg-black rounded-lg">
              {invocation.output.result}
            </pre>
          </div>
        )}

        {invocation.state === 'output-error' && (
          <div className="mt-4 text-sm text-red-300">
            Program error: {invocation.errorText}
          </div>
        )}
      </div>
    </div>
  );
}
