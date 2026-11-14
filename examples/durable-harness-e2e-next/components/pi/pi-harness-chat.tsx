'use client';

import type { PiHarnessAgentMessage } from '@/agent/pi/basic';
import HarnessChat, { CommonPartView } from '@/components/harness-chat';
import HarnessBashToolView from '@/components/tool/harness-bash-tool-view';
import HarnessFileToolView from '@/components/tool/harness-file-tool-view';
import HarnessToolView from '@/components/tool/harness-tool-view';

const FILE_TOOL_LABELS = {
  'tool-read': 'Read',
  'tool-write': 'Write',
  'tool-edit': 'Edit',
} as const;

/**
 * Converts the output of a Pi built-in tool (the content Pi shows the model)
 * to the plain text the tool views render.
 */
function toOutputText(output: unknown): unknown {
  if (
    typeof output !== 'object' ||
    output == null ||
    !Array.isArray((output as { content?: unknown }).content)
  ) {
    return output;
  }
  return (
    output as { content: Array<{ type?: string; text?: unknown }> }
  ).content
    .filter(item => item.type === 'text')
    .map(item => String(item.text ?? ''))
    .join('\n');
}

function PiPartView({
  part,
}: {
  part: PiHarnessAgentMessage['parts'][number];
}) {
  switch (part.type) {
    case 'tool-bash': {
      return (
        <HarnessBashToolView
          invocation={
            part.state === 'output-available'
              ? { ...part, output: toOutputText(part.output) }
              : part
          }
        />
      );
    }
    case 'tool-read':
    case 'tool-write':
    case 'tool-edit': {
      return (
        <HarnessFileToolView
          label={FILE_TOOL_LABELS[part.type]}
          invocation={part}
        />
      );
    }
    case 'tool-find':
    case 'tool-grep':
    case 'tool-ls': {
      return (
        <HarnessToolView
          toolName={
            part.type === 'tool-find' ? 'glob' : part.type.replace(/^tool-/, '')
          }
          toolArg={
            typeof part.input === 'object' && part.input != null
              ? ((part.input as { pattern?: string; path?: string }).pattern ??
                (part.input as { pattern?: string; path?: string }).path ??
                '')
              : ''
          }
          state={part.state}
          output={
            part.state === 'output-available'
              ? toOutputText(part.output)
              : undefined
          }
        />
      );
    }
    case 'tool-badMarker':
    case 'tool-addNote': {
      return (
        <HarnessToolView
          toolName={part.type.replace(/^tool-/, '')}
          input={part.input}
          state={part.state}
          output={part.state === 'output-available' ? part.output : undefined}
          errorText={part.state === 'output-error' ? part.errorText : undefined}
        />
      );
    }
    case 'dynamic-tool': {
      // Pi already emits Write tool calls, so we don't need to surface these dynamic fileChange events, which effectively show the same thing.
      if (part.toolName === 'fileChange') {
        return null;
      }
      return <CommonPartView part={part} />;
    }
    default: {
      return <CommonPartView part={part} />;
    }
  }
}

export default function PiHarnessChat({
  exampleLabel,
}: {
  exampleLabel: string;
}) {
  return (
    <HarnessChat<PiHarnessAgentMessage>
      exampleLabel={exampleLabel}
      PartView={PiPartView}
    />
  );
}
