import { agent } from '@/agent/pi/basic';
import { createCrashRequestHandler } from '@/lib/create-crash-request-handler';

export const POST = createCrashRequestHandler({ agent });
