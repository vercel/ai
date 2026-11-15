import type { xai } from '@ai-sdk/xai';
import type { UIToolInvocation } from 'ai';

export default function XaiImageGenerationView({
  invocation,
}: {
  invocation: UIToolInvocation<ReturnType<typeof xai.tools.imageGeneration>>;
}) {
  switch (invocation.state) {
    case 'input-streaming':
    case 'input-available':
      return (
        <div className="p-2 mb-2 bg-gray-900 rounded-xl border border-gray-600 shadow-lg text-gray-100">
          Generating image...
        </div>
      );
    case 'output-available':
      return (
        <div className="p-2 mb-2 bg-gray-900 rounded-xl border border-gray-600 shadow-lg">
          <img
            src={`data:image/jpeg;base64,${invocation.output.result}`}
            alt={invocation.output.prompt ?? 'Generated image'}
          />
          {invocation.output.prompt && (
            <div className="mt-1 text-xs italic text-gray-400">
              {invocation.output.prompt}
            </div>
          )}
        </div>
      );
    case 'output-error':
      return (
        <div className="p-2 mb-2 text-red-500 rounded-xl border border-red-500">
          Image generation failed: {invocation.errorText}
        </div>
      );
  }
}
