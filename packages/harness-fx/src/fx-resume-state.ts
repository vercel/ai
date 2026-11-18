import type { HarnessV1PromptTurnOptions } from '@ai-sdk/harness';
import { z } from 'zod/v4';
import type { FxPrompt, FxToolResult } from './fx-runtime';
import type { FxProvider } from './fx-subscription';

export type FxModelRecord = {
  fingerprint: string;
  body: string;
  status: number;
  complete: boolean;
  emittedOutput: { text: number; reasoning: number; finished?: boolean };
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

/**
 * Everything an fx session needs to be restored in another process: the
 * provider its credentials come from, the libfx checkpoint of the
 * conversation, and the replay records of an unfinished turn.
 */
export type FxSessionState = {
  provider: FxProvider;
  checkpoint?: string;
  turn?: FxTurnState;
};

export const fxProviderSchema = z.enum(['gateway', 'codex', 'grok']);

export const fxTurnStateSchema = z.object({
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
      emittedOutput: z.object({
        text: z.number().int().nonnegative(),
        reasoning: z.number().int().nonnegative(),
        finished: z.boolean().optional(),
      }),
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
});

export const fxSessionStateSchema = z.object({
  provider: fxProviderSchema,
  checkpoint: z.string().optional(),
  turn: fxTurnStateSchema.optional(),
});

/**
 * The adapter-defined `data` of fx lifecycle states. Without a session
 * storage it holds the whole session; with one it holds only `leafId`, the id
 * of the storage entry the session ends at.
 */
export const fxResumeStateSchema = z.union([
  z.strictObject({ session: fxSessionStateSchema }),
  z.strictObject({ leafId: z.string().min(1) }),
]);

export type FxResumeStateData =
  | { session: FxSessionState }
  | { leafId: string };

export function parseFxResumeStateData(data: unknown): FxResumeStateData {
  return fxResumeStateSchema.parse(data) as FxResumeStateData;
}
