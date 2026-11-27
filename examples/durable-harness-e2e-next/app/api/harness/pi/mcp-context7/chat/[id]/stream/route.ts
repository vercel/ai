import { agent } from '@/agent/pi/mcp-context7';
import { createChatStreamRequestHandler } from '@/lib/create-chat-stream-request-handler';

export const maxDuration = 800;

export const GET = createChatStreamRequestHandler({ agent });
