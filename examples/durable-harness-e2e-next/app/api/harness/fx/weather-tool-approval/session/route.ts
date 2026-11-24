import { agent } from '@/agent/fx/weather-tool-approval';
import { createSessionRequestHandler } from '@/lib/create-session-request-handler';

export const maxDuration = 300;

export const POST = createSessionRequestHandler({ agent });
