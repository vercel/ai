import type { HarnessAgentSession } from '@ai-sdk/harness/agent';
import { readUIMessageStream, type UIMessage, type UIMessageChunk } from 'ai';
import {
  createHarnessWorkflowState,
  runHarnessAgentTimeSlice,
  type HarnessWorkflowAgent,
  type HarnessWorkflowChunk,
  type HarnessWorkflowStreamResult,
} from '../../../../packages/workflow-harness/dist/index.js';

const toolInput: HarnessWorkflowChunk = {
  type: 'tool-input-available',
  toolCallId: 'call_1',
  toolName: 'bash',
  input: {
    command: 'node -e "setTimeout(() => console.log(\\"done\\"), 90000)"',
  },
  providerExecuted: true,
};

function streamResult(
  chunks: HarnessWorkflowChunk[],
  blockUntilSuspend = false,
): {
  result: HarnessWorkflowStreamResult;
  close: () => void;
} {
  let close = () => {};

  return {
    result: {
      toUIMessageStream() {
        return new ReadableStream<HarnessWorkflowChunk>({
          start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(chunk);
            }

            if (blockUntilSuspend) {
              close = () => controller.close();
            } else {
              controller.close();
            }
          },
        });
      },
      finishReason: Promise.resolve('stop'),
      totalUsage: Promise.resolve({}),
    },
    close: () => close(),
  };
}

function createSession(options: { suspend?: () => void }): HarnessAgentSession {
  return {
    sessionId: 'issue-18338',
    hasUnfinishedTurn: () => false,
    suspendTurn: async () => {
      options.suspend?.();
      return {
        type: 'continue-turn',
        harnessId: 'mock',
        specificationVersion: 'harness-v1',
        data: {},
      };
    },
    detach: async () => ({
      type: 'resume-session',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    stop: async () => ({
      type: 'resume-session',
      harnessId: 'mock',
      specificationVersion: 'harness-v1',
      data: {},
    }),
    destroy: async () => {},
  } as HarnessAgentSession;
}

async function renderFinalMessage(
  chunks: HarnessWorkflowChunk[],
): Promise<UIMessage> {
  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(chunk as UIMessageChunk);
      }
      controller.close();
    },
  });

  let finalMessage: UIMessage | undefined;
  for await (const message of readUIMessageStream({ stream })) {
    finalMessage = message;
  }

  if (finalMessage == null) {
    throw new Error('Reproduction setup failed: no UI message was rendered.');
  }

  return finalMessage;
}

async function main() {
  const emittedChunks: HarnessWorkflowChunk[] = [];
  const writable = new WritableStream<HarnessWorkflowChunk>({
    write(chunk) {
      emittedChunks.push(chunk);
    },
  });

  const firstSlice = streamResult(
    [{ type: 'start' }, { type: 'start-step' }, toolInput],
    true,
  );
  const secondSlice = streamResult([
    { type: 'start' },
    { type: 'start-step' },
    {
      type: 'tool-output-available',
      toolCallId: 'call_1',
      output: { exitCode: 0, stdout: 'done' },
      providerExecuted: true,
    },
    { type: 'finish-step' },
    { type: 'finish' },
  ]);

  const sessions = [
    createSession({ suspend: firstSlice.close }),
    createSession({}),
  ];
  let sessionIndex = 0;

  const agent: HarnessWorkflowAgent = {
    createSession: async () => sessions[sessionIndex++],
    stream: async () => firstSlice.result,
    continueStream: async () => secondSlice.result,
  };

  // The production runner deliberately unrefs its time-slice timer. Keep this
  // standalone process alive long enough for that timer to suspend the stream.
  const keepAlive = setTimeout(() => {}, 1_000);
  const suspendedState = await runHarnessAgentTimeSlice({
    agent,
    state: createHarnessWorkflowState({
      prompt:
        'Run exactly `node -e "setTimeout(() => console.log(\\"done\\"), 90000)"` and wait for it to finish before doing anything else.',
      sessionId: 'issue-18338',
    }),
    timeSliceSeconds: 0.01,
    writable,
  });
  clearTimeout(keepAlive);

  if (suspendedState.status !== 'ready_for_next_step') {
    throw new Error(
      `Reproduction setup failed: first slice ended as ${suspendedState.status}.`,
    );
  }

  const finishedState = await runHarnessAgentTimeSlice({
    agent,
    state: suspendedState,
    writable,
  });

  if (finishedState.status !== 'finished') {
    throw new Error(
      `Reproduction setup failed: continued slice ended as ${finishedState.status}.`,
    );
  }

  const finalMessage = await renderFinalMessage(emittedChunks);
  const toolParts = finalMessage.parts.filter(
    part => 'toolCallId' in part && part.toolCallId === 'call_1',
  );
  const states = toolParts.map(part =>
    'state' in part ? part.state : undefined,
  );

  if (
    toolParts.length === 2 &&
    states[0] === 'input-available' &&
    states[1] === 'output-available'
  ) {
    throw new Error(
      'ISSUE #18338 REPRODUCED: one completed tool call rendered as 2 UI parts; the first remains input-available.',
    );
  }

  if (toolParts.length !== 1 || states[0] !== 'output-available') {
    throw new Error(
      `Unexpected result: rendered ${toolParts.length} tool parts with states ${states.join(',')}.`,
    );
  }

  console.log(
    'Issue #18338 did not reproduce: one completed tool call rendered once.',
  );
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
