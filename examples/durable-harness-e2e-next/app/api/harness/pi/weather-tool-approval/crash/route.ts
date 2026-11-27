import { agent } from '@/agent/pi/weather-tool-approval';
import { createCrashRequestHandler } from '@/lib/create-crash-request-handler';

export const POST = createCrashRequestHandler({ agent });
