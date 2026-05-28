import type { HARNESS_V1_BUILTIN_TOOLS } from '@ai-sdk/harness';
import type { UIToolInvocation } from 'ai';

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
  'tool-read': { progress: 'Reading file', done: 'Read file' },
  'tool-write': { progress: 'Writing file', done: 'Wrote file' },
  'tool-edit': { progress: 'Editing file', done: 'Edited file' },
} as const;

export default function HarnessFileToolView({
  invocation,
}: {
  invocation: FileToolPart;
}) {
  if (!invocation.input?.file_path) {
    return null;
  }

  const { progress, done } = LABELS[invocation.type];
  const label = invocation.state === 'output-available' ? done : progress;

  return (
    <div className="text-sm text-gray-500">
      {label} <code>{invocation.input.file_path}</code>
    </div>
  );
}
