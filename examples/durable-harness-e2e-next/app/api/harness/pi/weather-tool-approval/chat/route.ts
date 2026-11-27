import { agent } from '@/agent/pi/weather-tool-approval';
import { createChatRequestHandler } from '@/lib/create-chat-request-handler';

export const maxDuration = 800;

export const POST = createChatRequestHandler({ agent });
