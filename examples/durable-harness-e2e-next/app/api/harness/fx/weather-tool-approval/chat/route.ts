import { agent } from '@/agent/fx/weather-tool-approval';
import { createChatRequestHandler } from '@/lib/create-chat-request-handler';

export const maxDuration = 800;

export const POST = createChatRequestHandler({ agent });
