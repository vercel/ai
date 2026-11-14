'use client';

import type { FxHarnessAgentMessage } from '@/agent/fx/basic';
import HarnessChat, { CommonPartView } from '@/components/harness-chat';
import HarnessBashToolView from '@/components/tool/harness-bash-tool-view';
import HarnessFileToolView from '@/components/tool/harness-file-tool-view';
import HarnessToolView from '@/components/tool/harness-tool-view';

const FILE_TOOL_LABELS = {
  'tool-read_file': 'Read',
  'tool-write_file': 'Write',
  'tool-edit_file': 'Edit',
} as const;

/**
 * Output of an fx built-in tool: the text fx shows the model, and whether it
 * is an error result.
 */
type FxBuiltinToolOutput = {
  text: string;
  isError?: true;
};

function isFxBuiltinToolOutput(output: unknown): output is FxBuiltinToolOutput {
  return (
    typeof output === 'object' &&
    output != null &&
    typeof (output as { text?: unknown }).text === 'string'
  );
}

/**
 * Converts the output of an fx built-in tool to the plain text the tool
 * views render.
 */
function toOutputText(output: unknown): unknown {
  return isFxBuiltinToolOutput(output) ? output.text : output;
}

/**
 * Converts the output of an fx shell call to what the bash tool view
 * renders, showing an error result as its error output.
 */
function toShellOutput(output: unknown): unknown {
  if (!isFxBuiltinToolOutput(output)) return output;
  return output.isError === true ? { stderr: output.text } : output.text;
}

function FxPartView({
  part,
}: {
  part: FxHarnessAgentMessage['parts'][number];
}) {
  switch (part.type) {
    case 'tool-shell': {
      const input = part.input;
      const command =
        input?.command ??
        [input?.action, input?.session_id].filter(Boolean).join(' ');
      return (
        <HarnessBashToolView
          label="Shell"
          invocation={{
            ...part,
            input: { command },
            output:
              part.state === 'output-available'
                ? toShellOutput(part.output)
                : undefined,
          }}
        />
      );
    }
    case 'tool-read_file':
    case 'tool-write_file':
    case 'tool-edit_file': {
      return (
        <HarnessFileToolView
          label={FILE_TOOL_LABELS[part.type]}
          invocation={part}
        />
      );
    }
    case 'tool-glob_files':
    case 'tool-grep_files': {
      return (
        <HarnessToolView
          toolName={part.type === 'tool-glob_files' ? 'glob' : 'grep'}
          toolArg={part.input?.pattern ?? part.input?.path ?? ''}
          state={part.state}
          output={
            part.state === 'output-available'
              ? toOutputText(part.output)
              : undefined
          }
          errorText={part.state === 'output-error' ? part.errorText : undefined}
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
    default: {
      return <CommonPartView part={part} />;
    }
  }
}

export default function FxHarnessChat({
  exampleLabel,
}: {
  exampleLabel: string;
}) {
  return (
    <HarnessChat<FxHarnessAgentMessage>
      exampleLabel={exampleLabel}
      PartView={FxPartView}
    />
  );
}
