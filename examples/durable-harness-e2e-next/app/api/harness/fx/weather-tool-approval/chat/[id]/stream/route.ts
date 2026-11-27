import { agent } from '@/agent/fx/weather-tool-approval';
import { createChatStreamRequestHandler } from '@/lib/create-chat-stream-request-handler';

export const maxDuration = 800;

export const GET = createChatStreamRequestHandler({ agent });
