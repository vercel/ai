import { anthropic } from '@ai-sdk/anthropic';
import { UIToolInvocation } from 'ai';

export default function AnthropicCodeExecutionView({
  invocation,
}: {
  invocation: UIToolInvocation<
    ReturnType<typeof anthropic.tools.codeExecution_20250825>
  >;
}) {
  switch (invocation.state) {
    case 'input-streaming':
    case 'input-available':
      return (
        <div className="mb-2 bg-gray-900 rounded-xl border border-gray-600 shadow-lg">
          Executing the following:
          <pre>{JSON.stringify(invocation.input, null, 2)}</pre>
        </div>
      );
    case 'output-available':
      return (
        <>
          <div className="mb-2 bg-gray-900 rounded-xl border border-gray-600 shadow-lg">
            Executing the following:
            <pre>{JSON.stringify(invocation.input, null, 2)}</pre>
          </div>
          <div className="mb-2 bg-gray-900 rounded-xl border border-gray-600 shadow-lg">
            Output:
            <pre>{JSON.stringify(invocation.output, null, 2)}</pre>
          </div>
        </>
      );
  }
}
