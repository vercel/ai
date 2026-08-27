import { readFile } from 'node:fs/promises';
import {
  type ClaudeMessage,
  createClaudeStreamEventState,
  createEmitStreamEvent,
} from '../../../../packages/harness-claude-code/src/bridge/create-emit-stream-event';

type RecordedClaudeMessage = {
  type?: string;
  event?: {
    type?: string;
    content_block?: {
      type?: string;
      id?: string;
      name?: string;
    };
    delta?: {
      type?: string;
      partial_json?: string;
    };
  };
};

async function main(): Promise<void> {
  const messages = JSON.parse(
    await readFile(
      new URL(
        '../../../../packages/harness-claude-code/src/bridge/__fixtures__/tool-input-stream.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as RecordedClaudeMessage[];
  const toolStart = messages.find(
    message =>
      message.event?.type === 'content_block_start' &&
      message.event.content_block?.type === 'tool_use',
  )?.event?.content_block;
  const expectedDeltas = messages.flatMap(message =>
    message.event?.type === 'content_block_delta' &&
    message.event.delta?.type === 'input_json_delta' &&
    typeof message.event.delta.partial_json === 'string'
      ? [message.event.delta.partial_json]
      : [],
  );

  if (
    toolStart?.id == null ||
    toolStart.name !== 'Write' ||
    expectedDeltas.length < 2
  ) {
    throw new Error('Invalid issue #19695 live-provider fixture');
  }

  const emitted: Record<string, unknown>[] = [];
  const emitStreamEvent = createEmitStreamEvent({
    state: createClaudeStreamEventState(),
    emit: event => emitted.push(event),
    emitWarning: () => {},
    emitTerminalError: () => {},
    onCompactionBoundary: () => {},
    toCommonName: name => name,
  });

  for (const message of messages) {
    emitStreamEvent(message as ClaudeMessage);
  }

  const toolInputEvents = emitted.filter(event =>
    ['tool-input-start', 'tool-input-delta', 'tool-input-end'].includes(
      String(event.type),
    ),
  );
  const eventTypes = toolInputEvents.map(event => event.type);
  const streamedDeltas = toolInputEvents
    .filter(event => event.type === 'tool-input-delta')
    .map(event => event.delta);
  const correlatedIds = new Set(toolInputEvents.map(event => event.id));
  const streamsToolInput =
    JSON.stringify(eventTypes) ===
      JSON.stringify([
        'tool-input-start',
        ...expectedDeltas.map(() => 'tool-input-delta'),
        'tool-input-end',
      ]) &&
    JSON.stringify(streamedDeltas) === JSON.stringify(expectedDeltas) &&
    correlatedIds.size === 1 &&
    correlatedIds.has(toolStart.id) &&
    toolInputEvents[0]?.toolName === 'Write';

  if (!streamsToolInput) {
    console.error(
      `ISSUE_19695_REPRODUCED: Claude Code tool input deltas were dropped before completion (provider deltas: ${expectedDeltas.length}, emitted tool-input events: ${toolInputEvents.length})`,
    );
    process.exitCode = 1;
    return;
  }

  console.log('Issue #19695 is fixed: Claude Code tool input streamed.');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
