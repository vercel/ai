import { z } from 'zod/v4';
import type { INTERFAZE_MODEL } from './side-channels';

export type InterfazeChatModelId = typeof INTERFAZE_MODEL | (string & {});

/** Guardrail categories (`ALL` enables everything). */
export const interfazeGuardCodes = [
  'S1',
  'S2',
  'S3',
  'S4',
  'S5',
  'S6',
  'S7',
  'S8',
  'S9',
  'S10',
  'S11',
  'S12',
  'S13',
  'S14',
  'S1_IMAGE',
  'S12_IMAGE',
  'S15_IMAGE',
  'ALL',
] as const;

export const interfazeLanguageModelChatOptions = z.object({
  /** Feed precomputed tool output to skip Interfaze's internal tool run. */
  precontext: z.array(z.unknown()).optional(),
  /** Enable guardrail categories; a match returns `unsafe <code>` as the message content. */
  guard: z.array(z.enum(interfazeGuardCodes)).optional(),
  /** Reasoning effort; also accepts Interfaze's `on` / `off` / `auto`. */
  reasoningEffort: z
    .enum(['minimal', 'low', 'medium', 'high', 'on', 'off', 'auto'])
    .optional(),
});

export type InterfazeLanguageModelChatOptions = z.infer<
  typeof interfazeLanguageModelChatOptions
>;
