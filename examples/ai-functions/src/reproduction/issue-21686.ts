import { readFileSync } from 'node:fs';
import {
  createClaudeStreamEventState,
  createEmitStreamEvent,
  type ClaudeMessage,
} from '../../../../packages/harness-claude-code/src/bridge/create-emit-stream-event';

const FAILURE_SIGNAL =
  'ISSUE_21686_REPRODUCED: Claude progress/response boundaries are missing';

type Fixture = {
  toolProgressMessages: ClaudeMessage[];
  responseBoundaryMessages: ClaudeMessage[];
};

function mapMessages(messages: ClaudeMessage[]) {
  const emitted: Record<string, unknown>[] = [];
  const mapMessage = createEmitStreamEvent({
    state: createClaudeStreamEventState(),
    emit: event => emitted.push(event),
    emitWarning: () => {},
    emitTerminalError: () => {},
    onCompactionBoundary: () => {},
    toCommonName: name => name,
  });

  for (const message of messages) mapMessage(message);
  return emitted;
}

async function main() {
  const fixture = JSON.parse(
    readFileSync(
      new URL(
        '../../../../packages/harness-claude-code/src/bridge/__fixtures__/issue-21686-live-events.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ) as Fixture;

  const progressParts = mapMessages(fixture.toolProgressMessages);
  const forwardedProgress = progressParts.filter(
    part =>
      part.type === 'tool-progress' ||
      (part.type === 'raw' &&
        (part.rawValue as { type?: string } | undefined)?.type ===
          'tool_progress'),
  );

  const responseEnds = mapMessages(fixture.responseBoundaryMessages).filter(
    part => part.type === 'response-end',
  );
  const responseEndsWithUsage = responseEnds.filter(part => part.usage != null);

  console.log(
    JSON.stringify(
      {
        sourceProgressCount: fixture.toolProgressMessages.length,
        forwardedProgressCount: forwardedProgress.length,
        sourceMessageStopCount: fixture.responseBoundaryMessages.filter(
          message =>
            message.type === 'stream_event' &&
            message.event?.type === 'message_stop',
        ).length,
        responseEndCount: responseEnds.length,
        responseEndsWithUsageCount: responseEndsWithUsage.length,
      },
      null,
      2,
    ),
  );

  if (
    forwardedProgress.length !== fixture.toolProgressMessages.length ||
    responseEnds.length !== 2 ||
    responseEndsWithUsage.length !== responseEnds.length
  ) {
    console.error(FAILURE_SIGNAL);
    process.exitCode = 1;
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 2;
});
