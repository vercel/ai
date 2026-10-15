import { createHash } from 'node:crypto';
import path from 'node:path';
import { shellQuote } from '@ai-sdk/harness/utils';
import {
  safeParseJSON,
  type Experimental_SandboxSession as SandboxSession,
} from '@ai-sdk/provider-utils';
import type { HarnessV1PromptTurnOptions } from '@ai-sdk/harness';
import { z } from 'zod/v4';
import type { FxPrompt, FxToolResult } from './fx-runtime';

const stateFileNameSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9._-]*\.json$/);

export const fxResumeStateSchema = z.object({
  version: z.literal(1),
  stateFileName: stateFileNameSchema,
});

export type FxModelRecord = {
  fingerprint: string;
  body: string;
  status: number;
  complete: boolean;
  emittedParts: number;
  attempt: number;
};

export type FxToolRecord = {
  id: string;
  name: string;
  input: unknown;
  status: 'waiting' | 'executing' | 'completed';
  approvalId?: string;
  approval?: { approved: boolean; reason?: string };
  result?: FxToolResult;
  output?: unknown;
};

export type FxTurnState = {
  id: string;
  prompt: FxPrompt;
  signature: string;
  responseFormat?: HarnessV1PromptTurnOptions['responseFormat'];
  models: FxModelRecord[];
  tools: FxToolRecord[];
  emittedKeys: string[];
  steers: Array<{ text: string; beforeRequest: number }>;
};

export type FxStoredState = {
  version: 1;
  sdkVersion: '0.0.13';
  checkpoint?: string;
  turn?: FxTurnState;
};

const storedStateSchema = z.object({
  version: z.literal(1),
  sdkVersion: z.literal('0.0.13'),
  checkpoint: z.string().optional(),
  turn: z
    .object({
      id: z.string(),
      prompt: z.union([z.string(), z.array(z.unknown())]),
      signature: z.string(),
      responseFormat: z.unknown().optional(),
      models: z.array(
        z.object({
          fingerprint: z.string(),
          body: z.string(),
          status: z.number(),
          complete: z.boolean(),
          emittedParts: z.number().int().nonnegative(),
          attempt: z.number().int().nonnegative(),
        }),
      ),
      tools: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          input: z.unknown(),
          status: z.enum(['waiting', 'executing', 'completed']),
          approvalId: z.string().optional(),
          approval: z
            .object({ approved: z.boolean(), reason: z.string().optional() })
            .optional(),
          result: z
            .object({
              type: z.literal('libfx.tool-result'),
              text: z.string(),
              images: z.array(
                z.object({
                  type: z.literal('image'),
                  mimeType: z.string(),
                  data: z.string().optional(),
                  sourceRef: z.string().optional(),
                }),
              ),
              isError: z.boolean().optional(),
            })
            .optional(),
          output: z.unknown().optional(),
        }),
      ),
      emittedKeys: z.array(z.string()),
      steers: z.array(
        z.object({
          text: z.string(),
          beforeRequest: z.number().int().nonnegative(),
        }),
      ),
    })
    .optional(),
});

export async function createFxStateStore(options: {
  sandbox: SandboxSession;
  sessionId: string;
  workDir: string;
  stateFileName?: string;
}) {
  const home = await options.sandbox.run({
    command: `printf '%s' "$HOME" | base64 -w0`,
  });
  if (home.exitCode !== 0 || !home.stdout.trim())
    throw new Error('Unable to resolve sandbox HOME for fx state.');
  const homeDir = Buffer.from(home.stdout.trim(), 'base64').toString('utf8');
  if (!path.posix.isAbsolute(homeDir))
    throw new Error('Sandbox HOME must be absolute.');
  const sessionKey = createHash('sha256')
    .update(options.sessionId)
    .digest('hex');
  const directory = path.posix.join(
    homeDir,
    '.ai-sdk',
    'harness-fx',
    sessionKey,
  );
  const relative = path.posix.relative(options.workDir, directory);
  if (
    relative === '' ||
    (!relative.startsWith('../') && !path.posix.isAbsolute(relative))
  ) {
    throw new Error('fx private state must be outside sessionWorkDir.');
  }
  const fileName = stateFileNameSchema.parse(
    options.stateFileName ?? 'state.json',
  );
  const filePath = path.posix.join(directory, fileName);
  const prepared = await options.sandbox.run({
    command: `mkdir -p -- ${shellQuote(directory)} && chmod 700 -- ${shellQuote(directory)}`,
  });
  if (prepared.exitCode !== 0)
    throw new Error('Unable to create private fx state directory.');
  let writes: Promise<void> = Promise.resolve();
  return {
    fileName,
    async load(): Promise<FxStoredState> {
      const text = await options.sandbox.readTextFile({ path: filePath });
      if (text == null)
        throw new Error('Cannot resume fx: the saved state file is missing.');
      const parsed = await safeParseJSON({ text, schema: storedStateSchema });
      if (!parsed.success)
        throw new Error(
          'Cannot resume fx: the saved state is invalid or incompatible.',
        );
      return parsed.value as FxStoredState;
    },
    save(state: FxStoredState): Promise<void> {
      const content = JSON.stringify(state);
      writes = writes.then(async () => {
        await options.sandbox.writeTextFile({
          path: `${filePath}.tmp`,
          content,
        });
        const result = await options.sandbox.run({
          command: `mv -- ${shellQuote(`${filePath}.tmp`)} ${shellQuote(filePath)}`,
        });
        if (result.exitCode !== 0)
          throw new Error(`Unable to persist fx state: ${result.stderr}`);
      });
      return writes;
    },
    flush: () => writes,
  };
}
