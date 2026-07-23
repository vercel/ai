import { openai } from '@ai-sdk/openai';
import type { Experimental_Session } from '@ai-sdk/provider';
import {
  generateText,
  isStepCount,
  tool,
  type LanguageModelMiddleware,
  wrapLanguageModel,
} from 'ai';
import { z } from 'zod';
import { run } from '../../lib/run';

const resourceKey = Symbol('manual-session-probe');

type ProbeResource = {
  id: number;
  providerCalls: number;
  keepAlive: ReturnType<typeof setInterval>;
};

let nextSessionId = 1;
let latestSession: Experimental_Session | undefined;

const sessionProbeMiddleware: LanguageModelMiddleware = {
  transformParams: async ({ type, params }) => {
    const session = params.experimental_session;

    if (session == null) {
      throw new Error('Core did not provide a Session.');
    }

    latestSession = session;

    const resource = session.getOrSet<ProbeResource>(
      resourceKey,
      () => ({
        id: nextSessionId++,
        providerCalls: 0,

        // This keeps Node alive if Session cleanup never happens.
        keepAlive: setInterval(() => {}, 10_000),
      }),
      {
        onDestroy: async resource => {
          console.log(
            `[session ${resource.id}] destroy started after ` +
              `${resource.providerCalls} provider calls`,
          );

          clearInterval(resource.keepAlive);

          // Makes it obvious that Core awaits asynchronous cleanup.
          await new Promise<void>(resolve => setTimeout(resolve, 500));

          console.log(`[session ${resource.id}] destroy finished`);
        },
      },
    );

    resource.providerCalls++;

    console.log(
      `[session ${resource.id}] ${type} provider call ` +
        `#${resource.providerCalls}`,
    );

    // Important: this lets the real provider receive the Session too.
    return params;
  },
};

run(async () => {
  const result = await generateText({
    model: wrapLanguageModel({
      model: openai('gpt-5-mini'),
      middleware: sessionProbeMiddleware,
    }),

    // Ensures exactly three model calls rather than relying on model behavior.
    maxRetries: 0,
    toolChoice: 'required',
    stopWhen: isStepCount(3),

    tools: {
      ping: tool({
        description: 'Return pong.',
        inputSchema: z.object({}),
        execute: async () => {
          console.log('[tool] ping');
          return { pong: true };
        },
      }),
    },

    prompt: 'Call the ping tool.',

    onStepFinish: ({ stepNumber }) => {
      console.log(`[core] step ${stepNumber} finished`);
    },

    onEnd: () => {
      console.log('[core] onEnd');

      try {
        latestSession!.has(resourceKey);
        console.log('[core] ERROR: Session remains usable');
      } catch (error) {
        console.log(
          `[core] post-destroy access: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    },
  });

  console.log(`[caller] resolved with ${result.steps.length} steps`);
});
