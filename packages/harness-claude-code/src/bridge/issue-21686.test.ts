import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createClaudeStreamEventState,
  createEmitStreamEvent,
  type ClaudeMessage,
} from './create-emit-stream-event';

type Fixture = {
  toolProgressMessages: ClaudeMessage[];
  responseBoundaryMessages: ClaudeMessage[];
};

const fixture = JSON.parse(
  readFileSync(
    new URL('./__fixtures__/issue-21686-live-events.json', import.meta.url),
    'utf8',
  ),
) as Fixture;

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

describe('issue #21686', () => {
  it('forwards live Claude tool progress and response boundaries with usage', () => {
    const progressParts = mapMessages(fixture.toolProgressMessages);
    expect(
      progressParts.some(
        part =>
          part.type === 'tool-progress' ||
          (part.type === 'raw' &&
            (part.rawValue as { type?: string } | undefined)?.type ===
              'tool_progress'),
      ),
    ).toBe(true);

    const responseEnds = mapMessages(fixture.responseBoundaryMessages).filter(
      part => part.type === 'response-end',
    );
    expect(responseEnds).toHaveLength(2);
    expect(responseEnds.every(part => part.usage != null)).toBe(true);
  });
});
