import type { HarnessAgentBuiltinTools } from '@ai-sdk/harness/agent';
import type { UIToolInvocation } from 'ai';
import ToolSpinner from './tool-spinner';

type FileToolPart =
  | ({ type: 'tool-read' } & UIToolInvocation<HarnessAgentBuiltinTools['read']>)
  | ({ type: 'tool-write' } & UIToolInvocation<
      HarnessAgentBuiltinTools['write']
    >)
  | ({ type: 'tool-edit' } & UIToolInvocation<
      HarnessAgentBuiltinTools['edit']
    >);

const LABELS = {
  'tool-read': 'Read',
  'tool-write': 'Write',
  'tool-edit': 'Edit',
} as const;

export default function HarnessFileToolView({
  invocation,
}: {
  invocation: FileToolPart;
}) {
  if (!invocation.input?.file_path) {
    return null;
  }

  const label = LABELS[invocation.type];
  const running = invocation.state !== 'output-available';

  return (
    <div className="relative mb-2 text-sm text-gray-500">
      {running && <ToolSpinner />}
      <strong>{label}</strong>(<code>{invocation.input.file_path}</code>)
    </div>
  );
}
