import { openai } from '@ai-sdk/openai';
import { UIToolInvocation } from 'ai';

export default function OpenAIWebSearchView({
  invocation,
}: {
  invocation: UIToolInvocation<ReturnType<typeof openai.tools.webSearch>>;
}) {
  if (invocation.state === 'input-available') {
    return (
      <pre className="overflow-auto p-2 text-sm bg-gray-100 rounded">
        {JSON.stringify(invocation.input, null, 2)}
      </pre>
    );
  }
  if (invocation.state === 'output-available') {
    return (
      <pre className="overflow-auto p-2 text-sm bg-gray-100 rounded">
        {JSON.stringify(invocation.input, null, 2)}
        {`\n\nDONE - Web search completed`}
      </pre>
    );
  }
}
