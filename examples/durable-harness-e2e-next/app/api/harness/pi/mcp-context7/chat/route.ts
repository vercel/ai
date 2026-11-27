import { agent } from '@/agent/pi/mcp-context7';
import { createChatRequestHandler } from '@/lib/create-chat-request-handler';

export const maxDuration = 800;

export const POST = createChatRequestHandler({ agent });
