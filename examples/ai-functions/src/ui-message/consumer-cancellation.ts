import {
  createUIMessageStream,
  type UIMessageStreamOnEndCallback,
  type UIMessage,
} from 'ai';

let finishExecution!: () => void;
const execution = new Promise<void>(resolve => {
  finishExecution = resolve;
});

type EndEvent = Parameters<UIMessageStreamOnEndCallback<UIMessage>>[0];
let resolveEnd!: (event: EndEvent) => void;
const ended = new Promise<EndEvent>(resolve => {
  resolveEnd = resolve;
});

const stream = createUIMessageStream({
  execute: ({ writer }) => {
    writer.write({ type: 'start' });
    return execution;
  },
  onEnd: resolveEnd,
});

const reader = stream.getReader();
await reader.read();
await reader.cancel('client disconnected');
finishExecution();

const event = await ended;
if (
  event.isCancelled !== true ||
  event.isAborted ||
  event.outcome.status !== 'unknown'
) {
  throw new Error('Expected an undeclared consumer-cancelled stream.');
}

console.log({
  isCancelled: event.isCancelled,
  isAborted: event.isAborted,
  outcome: event.outcome.status,
});
