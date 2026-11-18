import { agent } from '@/agent/pi/mcp-context7';
import { createSessionRequestHandler } from '@/lib/create-session-request-handler';

export const maxDuration = 300;

export const POST = createSessionRequestHandler({ agent });
