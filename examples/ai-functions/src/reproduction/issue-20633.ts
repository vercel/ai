import { readFile } from 'node:fs/promises';
import {
  type ClaudeMessage,
  createClaudeStreamEventState,
  createEmitStreamEvent,
} from '../../../../packages/harness-claude-code/src/bridge/create-emit-stream-event';

type Usage = {
  outputTokens?: {
    total?: number;
  };
};

async function main() {
  const fixtureUrl = new URL(
    '../../../../packages/harness-claude-code/src/bridge/__fixtures__/issue-20633-direct-step-usage.json',
    import.meta.url,
  );
  const messages = JSON.parse(
    await readFile(fixtureUrl, 'utf8'),
  ) as ClaudeMessage[];
  const state = createClaudeStreamEventState();
  const emitted: Record<string, unknown>[] = [];
  const emitStreamEvent = createEmitStreamEvent({
    state,
    emit: event => emitted.push(event),
    emitWarning: () => {},
    emitTerminalError: () => {},
    onCompactionBoundary: () => {},
    toCommonName: name => (name === 'Bash' ? 'bash' : name),
  });

  for (const message of messages) {
    emitStreamEvent(message);
  }

  const finishStep = emitted.find(event => event.type === 'finish-step');
  const actualOutputTokens = (finishStep?.usage as Usage | undefined)
    ?.outputTokens?.total;
  const expectedOutputTokens = 115;

  if (actualOutputTokens !== expectedOutputTokens) {
    throw new Error(
      `ISSUE_20633_REPRODUCED: finish-step outputTokens=${actualOutputTokens}, message_delta outputTokens=${expectedOutputTokens}`,
    );
  }

  console.log(
    `finish-step outputTokens matched message_delta: ${actualOutputTokens}`,
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
