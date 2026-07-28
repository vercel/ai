import { Buffer } from 'node:buffer';
import { tool } from 'ai';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  experimental_isCodeModeInterrupt as isCodeModeInterrupt,
  experimental_requestCodeModeInterrupt as requestCodeModeInterrupt,
  experimental_runCodeMode as runCodeMode,
  experimental_setCodeModeWorkerUrl as setCodeModeWorkerUrl,
} from '../dist/index.js';

const ADJACENT_TURN_WORKER_SOURCE = `
import { parentPort } from "node:worker_threads";

let invocationId;
let sentSibling = false;

parentPort.on("message", (message) => {
  if (message.type === "run") {
    invocationId = message.invocationId;
    parentPort.postMessage({
      type: "tool-request",
      invocationId,
      requestId: invocationId + ":bridge-1",
      toolName: "first",
      inputJson: "{}",
    });
    return;
  }

  if (message.type === "bridge-drain") {
    if (!sentSibling) {
      sentSibling = true;
      parentPort.postMessage({
        type: "tool-request",
        invocationId,
        requestId: invocationId + ":bridge-2",
        toolName: "second",
        inputJson: "{}",
      });
    }
    parentPort.postMessage({
      type: "bridge-drained",
      invocationId,
      drainId: message.drainId,
    });
  }
});
`;

describe('interrupt bridge draining', () => {
  afterEach(() => {
    setCodeModeWorkerUrl();
  });

  it('waits for sibling requests posted before the worker drain acknowledgement', async () => {
    setCodeModeWorkerUrl(
      new URL(
        `data:text/javascript;base64,${Buffer.from(ADJACENT_TURN_WORKER_SOURCE).toString('base64')}`,
      ),
    );
    const interruptingTool = (name: string) =>
      tool({
        inputSchema: z.object({}),
        execute: async (): Promise<void> => {
          requestCodeModeInterrupt({ kind: 'test', name });
        },
      });

    const interrupt = await runCodeMode({
      js: 'return await Promise.all([tools.first({}), tools.second({})]);',
      tools: {
        first: interruptingTool('first'),
        second: interruptingTool('second'),
      },
    });

    expect(isCodeModeInterrupt(interrupt)).toBe(true);
    if (!isCodeModeInterrupt(interrupt)) {
      throw new Error('Expected generic interrupt.');
    }
    expect(
      interrupt.continuation.ledger.map(({ name, status }) => ({
        name,
        status,
      })),
    ).toEqual([
      { name: 'first', status: 'interrupted' },
      { name: 'second', status: 'interrupted' },
    ]);
  });
});
