import { tool, type InferUITools, type UIMessage } from 'ai';
import { z } from 'zod/v4';

export const tools = {
  getTimezone: tool({
    description: "Get the user's time zone from their browser.",
    inputSchema: z.object({}),
    outputSchema: z.string(),
    // No execute: the browser supplies this result with addToolOutput.
  }),
};

export type WebSocketChatMessage = UIMessage<
  never,
  never,
  InferUITools<typeof tools>
>;
