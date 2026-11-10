import assert from 'node:assert/strict';
import { once } from 'node:events';
import { HarnessAgent, HarnessAgentSession } from '@ai-sdk/harness/agent';
import type { HarnessV1NetworkSandboxSession } from '@ai-sdk/harness';
import { createOpenCode } from '@ai-sdk/harness-opencode';
import { WebSocketServer } from 'ws';

async function main() {
  // Exercise the actual OpenCode translator, adapter, and HarnessAgent. Only
  // OpenCode's event source and the remote sandbox are replaced by local replay.
  const bridgeSource = new URL(
    '../../../../packages/harness-opencode/src/bridge/',
    import.meta.url,
  );
  const { createEmitStreamEvent } = await import(
    new URL('create-emit-stream-event.ts', bridgeSource).href
  );
  const { createTranslationState, emitOpenCodeStreamStart } = await import(
    new URL('opencode-events.ts', bridgeSource).href
  );
  const { defaultUsage } = await import(
    new URL('opencode-usage.ts', bridgeSource).href
  );
  const server = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const endpoint = { url: `ws://127.0.0.1:${address.port}` };
  let turn = 0;
  const wireEvents: Record<string, unknown>[][] = [];
  const part = {
    id: 'old-part',
    messageID: 'answer-1',
    sessionID: 'opencode-session',
    type: 'tool',
    callID: 'call_read_1',
    tool: 'read',
    state: {
      status: 'completed',
      input: { filePath: 'README.md' },
      output: 'contents',
      title: 'Read README.md',
      metadata: {},
      time: { start: 1, end: 2 },
    },
  };
  server.on('connection', socket => {
    socket.send(JSON.stringify({ type: 'bridge-hello' }));
    socket.on('message', data => {
      const command = JSON.parse(data.toString());
      if (command.type !== 'start') return;
      turn++;
      const emitted: Record<string, unknown>[] = [];
      wireEvents.push(emitted);
      const emit = (event: Record<string, unknown>) => {
        emitted.push(event);
        socket.send(JSON.stringify(event));
      };
      const state = createTranslationState();
      const emitStreamEvent = createEmitStreamEvent({
        state,
        emit,
        emitWarning: (warning: unknown) => {
          throw new Error(`Unexpected translator warning: ${String(warning)}`);
        },
        emitError: (error: unknown) => {
          throw new Error(`Unexpected translator error: ${String(error)}`);
        },
        toWireToolName: (name: string) => name,
        nativeNameField: () => ({}),
        getHostToolName: () => undefined,
        authorizeHostToolCall: () => {},
        isMcpToolName: () => false,
        stripWorkDir: (file: string) => file,
        formatError: String,
      });
      const updatePart = (value: unknown) =>
        emitStreamEvent({
          type: 'message.part.updated',
          properties: { part: value },
        });
      emitStreamEvent({
        type: 'message.updated',
        properties: {
          info: { id: `answer-${turn}`, role: 'assistant' },
        },
      });
      emitOpenCodeStreamStart({
        info: { id: `answer-${turn}`, role: 'assistant' },
        state,
        emit,
      });
      emitStreamEvent({
        type: 'session.status',
        properties: {
          sessionID: 'opencode-session',
          status: { type: 'busy' },
        },
      });
      if (turn === 1) updatePart(part);
      updatePart({
        id: `text-${turn}`,
        messageID: `answer-${turn}`,
        type: 'text',
        text: 'Done.',
      });
      updatePart({
        id: `step-${turn}`,
        messageID: `answer-${turn}`,
        type: 'step-finish',
        reason: 'stop',
      });
      if (turn === 2) {
        updatePart({
          ...part,
          state: {
            ...part.state,
            time: { ...part.state.time, compacted: 3 },
          },
        });
      }
      emitStreamEvent({
        type: 'session.status',
        properties: {
          sessionID: 'opencode-session',
          status: { type: 'idle' },
        },
      });
      // runTurn's finally block emits this after runPrompt ends on idle.
      emit({
        type: 'finish',
        finishReason: { unified: 'stop', raw: 'stop' },
        totalUsage: defaultUsage(),
      });
    });
  });
  const sandbox = {
    async run() {
      return { exitCode: 0, stdout: '/work', stderr: '' };
    },
    async readTextFile() {
      return null;
    },
    async writeTextFile() {},
  };
  const sandboxSession = {
    id: 'local-replay',
    defaultWorkingDirectory: '/work',
    restricted: () => sandbox,
    ports: [address.port],
    async getPortEndpoint() {
      return endpoint;
    },
    async getPortUrl() {
      return endpoint.url;
    },
    async stop() {},
  } as unknown as HarnessV1NetworkSandboxSession;
  const harness = createOpenCode({ portEndpoint: endpoint });
  let session: HarnessAgentSession | undefined;
  try {
    const underlyingSession = await harness.doStart({
      sessionId: 'issue-24751',
      sessionWorkDir: '/work',
      sandboxSession,
      resumeFrom: {
        type: 'resume-session',
        harnessId: 'opencode',
        specificationVersion: 'harness-v1',
        data: {
          openCodeSessionId: 'opencode-session',
          bridge: {
            port: address.port,
            token: 'local-replay',
            lastSeenEventId: 0,
          },
        },
      },
    });
    session = new HarnessAgentSession({
      sessionId: 'issue-24751',
      harness,
      underlyingSession,
      sandboxSession,
      sessionWorkDir: '/work',
      ownsSandboxLifecycle: false,
      toolApproval: undefined,
    });
    const agent = new HarnessAgent({ harness });
    for (const currentTurn of [1, 2]) {
      const result = await agent.stream({
        session,
        prompt: 'Answer Done.',
        abortSignal: AbortSignal.timeout(10_000),
      });
      let answer = '';
      for await (const event of result.fullStream) {
        if (event.type === 'text-delta') answer += event.text;
      }
      assert.equal(
        answer,
        'Done.',
        'The answer must stream before termination',
      );
      console.log(
        `turn ${currentTurn}: ${wireEvents[currentTurn - 1]
          .map(event => event.type)
          .join(', ')}`,
      );
      // The primary assertion is successful terminal completion, not merely
      // an exact intermediate event sequence or the proposed compacted guard.
      try {
        const steps = await result.steps;
        assert.ok(
          steps.length > 0,
          'A completed answer must have a finished step',
        );
        assert.equal(await result.text, 'Done.');
      } catch (error) {
        if (
          currentTurn === 2 &&
          error instanceof Error &&
          error.message.includes(
            'received terminal finish with unclosed step content',
          )
        ) {
          throw new Error(
            'ISSUE-24751: turn 2 failed after Done. streamed when an earlier-turn tool was pruned',
            { cause: error },
          );
        }
        throw error;
      }
      console.log(`turn ${currentTurn}: completed successfully`);
    }
  } finally {
    await session?.detach();
    for (const client of server.clients) client.terminate();
    await new Promise<void>((resolve, reject) => {
      server.close(error => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
