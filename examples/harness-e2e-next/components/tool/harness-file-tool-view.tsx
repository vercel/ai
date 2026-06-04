import type { HARNESS_V1_BUILTIN_TOOLS } from '@ai-sdk/harness';
import type { UIToolInvocation } from 'ai';
import ToolSpinner from './tool-spinner';

type FileToolPart =
  | ({ type: 'tool-read' } & UIToolInvocation<
      typeof HARNESS_V1_BUILTIN_TOOLS.read
    >)
  | ({ type: 'tool-write' } & UIToolInvocation<
      typeof HARNESS_V1_BUILTIN_TOOLS.write
    >)
  | ({ type: 'tool-edit' } & UIToolInvocation<
      typeof HARNESS_V1_BUILTIN_TOOLS.edit
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
