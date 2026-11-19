import { agent } from '@/agent/pi/basic';
import { createChatRequestHandler } from '@/lib/create-chat-request-handler';

export const maxDuration = 800;

export const POST = createChatRequestHandler({ agent });
