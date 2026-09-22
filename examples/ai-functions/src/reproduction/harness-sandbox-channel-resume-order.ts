import type {
  HarnessV1,
  HarnessV1ContinueTurnState,
  HarnessV1PromptControl,
  HarnessV1Session,
  HarnessV1StreamPart,
} from '@ai-sdk/harness';
import { HarnessAgent } from '@ai-sdk/harness/agent';
import { SandboxChannel } from '@ai-sdk/harness/utils';
import type { Experimental_SandboxSession } from '@ai-sdk/provider-utils';
import { NoObjectGeneratedError, Output } from 'ai';
import { z } from 'zod';

const zeroUsage = () => ({
  inputTokens: {
    total: undefined,
    noCache: undefined,
    cacheRead: undefined,
    cacheWrite: undefined,
  },
  outputTokens: {
    total: undefined,
    text: undefined,
    reasoning: undefined,
  },
});

const replay = [
  {
    type: 'finish-step',
    seq: 1,
    finishReason: { unified: 'tool-calls', raw: 'tool_use' },
    usage: zeroUsage(),
  },
  { type: 'text-start', seq: 2, id: 'structured' },
  {
    type: 'text-delta',
    seq: 3,
    id: 'structured',
    delta: '{"ok":true}',
  },
  { type: 'text-end', seq: 4, id: 'structured' },
  {
    type: 'finish-step',
    seq: 5,
    finishReason: { unified: 'stop', raw: 'end_turn' },
    usage: zeroUsage(),
  },
  {
    type: 'finish',
    seq: 6,
    finishReason: { unified: 'stop', raw: 'end_turn' },
    totalUsage: zeroUsage(),
  },
] satisfies Array<HarnessV1StreamPart & { seq: number }>;

const channel = new SandboxChannel<HarnessV1StreamPart>({
  connect: () => new Promise(() => {}),
  outboundSchema: z.custom<HarnessV1StreamPart>(),
});

const dispatch = channel as unknown as {
  dispatch(message: HarnessV1StreamPart): void;
};
for (const event of replay) {
  dispatch.dispatch(event);
}

const delivered: string[] = [];

const session: HarnessV1Session = {
  sessionId: 'resume-order-reproduction',
  isResume: true,
  doPromptTurn: async () => {
    throw new Error('The reproduction must continue the resumed turn.');
  },
  doContinueTurn: async options => {
    let resolveDone!: () => void;
    const done = new Promise<void>(resolve => {
      resolveDone = resolve;
    });
    const eventTypes = [
      'stream-start',
      'text-start',
      'text-delta',
      'text-end',
      'reasoning-start',
      'reasoning-delta',
      'reasoning-end',
      'tool-input-start',
      'tool-input-delta',
      'tool-input-end',
      'tool-call',
      'tool-approval-request',
      'tool-result',
      'finish-step',
      'raw',
    ] as const;

    for (const type of eventTypes) {
      channel.on(type, event => {
        delivered.push(
          `${(event as HarnessV1StreamPart & { seq: number }).seq}:${event.type}`,
        );
        options.emit(event);
      });
    }
    channel.on('finish', event => {
      delivered.push(
        `${(event as unknown as { seq: number }).seq}:${event.type}`,
      );
      options.emit(event);
      resolveDone();
    });

    return {
      done,
      submitToolResult: async () => {},
      submitToolApproval: async () => {},
    } satisfies HarnessV1PromptControl;
  },
  doCompact: async () => {},
  doDetach: async () => ({
    type: 'resume-session',
    harnessId: 'resume-order-reproduction',
    specificationVersion: 'harness-v1',
    data: {},
  }),
  doStop: async () => ({
    type: 'resume-session',
    harnessId: 'resume-order-reproduction',
    specificationVersion: 'harness-v1',
    data: {},
  }),
  doDestroy: async () => {},
  doSuspendTurn: async () => ({
    type: 'continue-turn',
    harnessId: 'resume-order-reproduction',
    specificationVersion: 'harness-v1',
    data: {},
  }),
};

const harness: HarnessV1 = {
  specificationVersion: 'harness-v1',
  harnessId: 'resume-order-reproduction',
  builtinTools: {},
  doStart: async options => {
    if (options.continueFrom == null) {
      throw new Error('The reproduction requires a continued turn.');
    }
    return session;
  },
};

const sandboxSession = {
  description: 'Local reproduction sandbox',
  run: async ({ command }: { command: string }) => ({
    exitCode: 0,
    stdout: command === 'pwd' ? '/work\n' : '',
    stderr: '',
  }),
} as unknown as Experimental_SandboxSession;

const continueFrom: HarnessV1ContinueTurnState = {
  type: 'continue-turn',
  harnessId: harness.harnessId,
  specificationVersion: 'harness-v1',
  data: {},
};

async function main() {
  const agent = new HarnessAgent({
    harness,
    output: Output.object({
      schema: z.object({ ok: z.literal(true) }),
    }),
  });
  const agentSession = await agent.createSession({
    sessionId: session.sessionId,
    continueFrom,
    sandboxSession,
  });

  try {
    const result = await agent.continueGenerate({ session: agentSession });
    if (result.output.ok !== true) {
      throw new Error(
        'Expected the resumed structured output to equal {ok:true}.',
      );
    }
    console.log(`delivered: ${delivered.join(', ')}`);
    console.log('OK: resumed Output.object() returned the complete object');
  } catch (error) {
    console.error(`delivered: ${delivered.join(', ')}`);
    if (NoObjectGeneratedError.isInstance(error)) {
      console.error(
        'BUG: resumed Output.object() rejected the complete structured output with NoObjectGeneratedError',
      );
      process.exitCode = 1;
      return;
    }
    throw error;
  }
}

await main();
