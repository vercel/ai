import { agent } from '@/agent/pi/basic';
import { createSessionRequestHandler } from '@/lib/create-session-request-handler';

export const maxDuration = 300;

export const POST = createSessionRequestHandler({ agent });
