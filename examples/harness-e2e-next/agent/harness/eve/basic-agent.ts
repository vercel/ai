import type {
  HarnessV1NetworkSandboxSession,
  HarnessV1SandboxProvider,
} from '@ai-sdk/harness';
import {
  HarnessAgent,
  createFileReporter,
  createTraceTreeReporter,
} from '@ai-sdk/harness/agent';
import { createEve } from '@ai-sdk/harness-eve';
import type { InferUITools, UIMessage } from 'ai';

const url = process.env.EVE_BASIC_AGENT_URL;

if (!url) {
  throw new Error('Set EVE_BASIC_AGENT_URL to a remote Eve agent URL.');
}

export const eveHarnessAgent = new HarnessAgent({
  harness: createEve({ url }),
  sandbox: createInertEveExampleSandbox(),
  debug: { enabled: true },
  telemetry: {
    integrations: [
      createTraceTreeReporter(),
      createFileReporter({ dir: '.harness-observability/eve/basic' }),
    ],
  },
});

/*
 * Derived from `agent.tools` directly rather than `InferAgentUIMessage<typeof
 * agent>`. The latter extracts the tool set via `AGENT extends Agent<any,
 * infer TOOLS, any>`, which infers `string` for HarnessAgent because its
 * generate/stream parameters intersect `AgentCallParameters<...>` with the
 * required-`session` extension and that disrupts structural inference. Going
 * through the `tools` field side-steps the issue while preserving the same
 * concrete UIMessage shape.
 *
 * TODO: revert to `InferAgentUIMessage<typeof eveHarnessAgent>` once `session`
 * is supported natively as part of `AgentCallParameters`, so the intersection
 * in HarnessAgent's generate/stream parameters can be dropped.
 */
export type EveHarnessAgentMessage = UIMessage<
  unknown,
  never,
  InferUITools<typeof eveHarnessAgent.tools>
>;

/*
 * Eve agents execute against their own remote runtime. HarnessAgent still
 * requires a sandbox provider for session bookkeeping and for the generic
 * host-tool contract, but this example must not import a concrete sandbox
 * runtime into the Next route bundle. This inert provider handles the
 * framework's working-directory probes and lifecycle calls while all Eve tool
 * execution stays inside the configured remote Eve agent.
 */
function createInertEveExampleSandbox(): HarnessV1SandboxProvider {
  return {
    specificationVersion: 'harness-sandbox-v1',
    providerId: 'eve-example-inert-sandbox',
    createSession: async options => {
      options?.abortSignal?.throwIfAborted();
      const session = createInertEveExampleSandboxSession({
        sessionId: options?.sessionId,
      });

      if (options?.onFirstCreate != null) {
        await options.onFirstCreate(session.restricted(), {
          abortSignal: options.abortSignal,
        });
      }

      return session;
    },
    resumeSession: async options => {
      options.abortSignal?.throwIfAborted();
      return createInertEveExampleSandboxSession({
        sessionId: options.sessionId,
      });
    },
  };
}

const INERT_SANDBOX_WORK_DIR = '/tmp/eve-harness-sandbox';

function createInertEveExampleSandboxSession({
  sessionId,
}: {
  readonly sessionId?: string;
}): HarnessV1NetworkSandboxSession {
  const sandboxSession: HarnessV1NetworkSandboxSession = {
    id: sessionId ?? 'eve-example-inert-sandbox',
    description:
      'Inert sandbox placeholder. The remote Eve agent owns its execution environment.',
    defaultWorkingDirectory: INERT_SANDBOX_WORK_DIR,
    ports: [],
    getPortUrl: async ({ port }) => {
      throw new Error(
        `Eve basic example inert sandbox does not expose port ${port}.`,
      );
    },
    run: async ({ command }) => {
      if (command === 'pwd') {
        return {
          exitCode: 0,
          stdout: `${INERT_SANDBOX_WORK_DIR}\n`,
          stderr: '',
        };
      }
      if (command.startsWith('mkdir ')) {
        return { exitCode: 0, stdout: '', stderr: '' };
      }
      return {
        exitCode: 1,
        stdout: '',
        stderr:
          'The Eve basic example uses an inert sandbox placeholder; commands are executed by the remote Eve agent.',
      };
    },
    spawn: async () => ({
      stdout: emptyStream(),
      stderr: emptyStream(),
      wait: async () => ({ exitCode: 1 }),
      kill: async () => {},
    }),
    readFile: async () => null,
    readBinaryFile: async () => null,
    readTextFile: async () => null,
    writeFile: async () => {},
    writeBinaryFile: async () => {},
    writeTextFile: async () => {},
    stop: async () => {},
    destroy: async () => {},
    restricted: () => sandboxSession,
  };

  return sandboxSession;
}

function emptyStream(): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      controller.close();
    },
  });
}
