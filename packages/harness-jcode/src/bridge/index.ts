import { JcodeClient } from '@1jehuang/jcode-sdk';
import {
  runBridge,
  type BridgeEvent,
  type BridgeTurn,
} from '@ai-sdk/harness/bridge';
import { argv } from 'node:process';
import type { JcodeBridgeStartMessage } from '../jcode-bridge-protocol';
import {
  createJcodeTranslatorState,
  translateJcodeEvent,
} from '../jcode-translate';

const args = parseArgs(argv.slice(2));
const workdir = required(args.workdir, '--workdir');
const bridgeStateDir = required(args.bridgeStateDir, '--bridge-state-dir');
const jcodeHome = required(args.jcodeHome, '--jcode-home');

let client: JcodeClient | undefined;
let sessionId: string | undefined;

await runBridge<JcodeBridgeStartMessage>({
  bridgeType: 'jcode',
  bridgeStateDir,
  onStart: runTurn,
  onStop: () => ({ jcodeSessionId: sessionId }),
  onDestroy: async () => {
    await client?.close();
    client = undefined;
  },
});

async function runTurn(
  start: JcodeBridgeStartMessage,
  turn: BridgeTurn,
): Promise<void> {
  try {
    const runtime = await ensureRuntime(start);
    if (start.operation === 'compact') {
      const summary = await runtime.compact(sessionId!);
      turn.emit({
        type: 'compaction',
        trigger: 'manual',
        summary,
      } as BridgeEvent);
      turn.emit(finishEvent());
      return;
    }

    const stream = runtime.events(sessionId!);
    const state = createJcodeTranslatorState();
    const abort = () => {
      void runtime.cancel(sessionId!).catch(() => {});
    };
    turn.abortSignal.addEventListener('abort', abort, { once: true });
    turn.emit({
      type: 'stream-start',
      ...(start.model ? { modelId: start.model } : {}),
    } as BridgeEvent);
    try {
      await runtime.sendMessage(sessionId!, start.prompt);
      for await (const event of stream) {
        if (event.ev === 'error') {
          throw new Error(`${event.code}: ${event.message}`);
        }
        for (const part of translateJcodeEvent(event, state)) {
          turn.emit(part as BridgeEvent);
        }
        if (event.ev === 'turn_done') return;
      }
      throw new Error('Jcode event stream closed before turn_done');
    } finally {
      turn.abortSignal.removeEventListener('abort', abort);
      await stream.return?.();
    }
  } catch (error) {
    turn.emitError({ error, message: 'Jcode turn failed' });
  }
}

async function ensureRuntime(
  start: JcodeBridgeStartMessage,
): Promise<JcodeClient> {
  client ??= await JcodeClient.launch({
    jcodeHome,
    workingDir: workdir,
    inheritLogins: false,
    clientName: 'ai-sdk/harness-jcode-bridge',
  });
  if (!sessionId) {
    const session = start.resumeSessionId
      ? await client.attachSession(start.resumeSessionId)
      : await client.createSession(workdir);
    sessionId = session.session_id;
    if (start.model) await client.setModel(sessionId, start.model);
    if (start.reasoningEffort) {
      await client.setReasoningEffort(sessionId, start.reasoningEffort);
    }
  }
  return client;
}

function finishEvent(): BridgeEvent {
  return {
    type: 'finish',
    finishReason: { unified: 'stop', raw: 'compact' },
    totalUsage: {
      inputTokens: {
        total: 0,
        noCache: 0,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: { total: 0, text: 0, reasoning: 0 },
    },
  } as BridgeEvent;
}

function parseArgs(values: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (let index = 0; index < values.length; index += 2) {
    const key = values[index]?.replace(/^--/, '');
    const value = values[index + 1];
    if (key && value) parsed[key] = value;
  }
  return parsed;
}

function required(value: string | undefined, flag: string): string {
  if (!value) throw new Error(`Missing ${flag} argument.`);
  return value;
}
