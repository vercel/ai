import { createUIMessageStream, type UIMessageStreamOutcome } from 'ai';

let finishExecution!: () => void;
const execution = new Promise<void>(resolve => {
  finishExecution = resolve;
});

let resolveOutcome!: (status: UIMessageStreamOutcome['status']) => void;
const outcome = new Promise<UIMessageStreamOutcome['status']>(resolve => {
  resolveOutcome = resolve;
});

const stream = createUIMessageStream({
  execute: ({ writer }) => {
    writer.write({ type: 'start' });
    return execution;
  },
  onEnd: ({ outcome }) => {
    resolveOutcome(outcome.status);
  },
});

const reader = stream.getReader();
await reader.read();
await reader.cancel('client disconnected');
finishExecution();

const status = await outcome;
if (status !== 'cancelled') {
  throw new Error(`Expected a cancelled outcome, received ${status}.`);
}

console.log(status);
