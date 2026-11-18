import { agent } from '@/agent/fx/basic';
import { createChatStreamRequestHandler } from '@/lib/create-chat-stream-request-handler';

export const maxDuration = 800;

export const GET = createChatStreamRequestHandler({ agent });
