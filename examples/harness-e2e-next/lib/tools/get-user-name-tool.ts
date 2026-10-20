import { tool, type UIToolInvocation } from 'ai';
import { z } from 'zod';

export const getUserNameTool = tool({
  description: 'Ask the user to enter their name in the client.',
  inputSchema: z.object({}),
  outputSchema: z.object({ name: z.string() }),
});

export type GetUserNameUIToolInvocation = UIToolInvocation<
  typeof getUserNameTool
>;
