import { anthropic } from '@ai-sdk/anthropic';
import { UIToolInvocation } from 'ai';

export default function AnthropicWebSearchView({
  invocation,
}: {
  invocation: UIToolInvocation<
    ReturnType<typeof anthropic.tools.webSearch_20250305>
  >;
}) {
  switch (invocation.state) {
    case 'input-available':
      return (
        <div className="mb-2 bg-gray-900 rounded-xl border border-gray-600 shadow-lg">
          Searching the web with the following query: {invocation.input.query}
        </div>
      );
    case 'output-available':
      return (
        <>
          <div className="mb-2 bg-gray-900 rounded-xl border border-gray-600 shadow-lg">
            Searching the web with the following query: {invocation.input.query}
          </div>
          <div className="mb-2 bg-gray-900 rounded-xl border border-gray-600 shadow-lg">
            {JSON.stringify(invocation.output, null, 2)}
          </div>
        </>
      );
  }
}
