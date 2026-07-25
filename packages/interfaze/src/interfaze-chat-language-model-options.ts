import { z } from 'zod/v4';
import type { INTERFAZE_MODEL } from './side-channels';

export type InterfazeChatModelId = typeof INTERFAZE_MODEL | (string & {});

export const interfazeLanguageModelChatOptions = z.object({
  precontext: z.array(z.unknown()).optional(),
});

export type InterfazeLanguageModelChatOptions = z.infer<
  typeof interfazeLanguageModelChatOptions
>;
