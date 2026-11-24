import { agent } from '@/agent/fx/weather-tool-approval';
import { createCrashRequestHandler } from '@/lib/create-crash-request-handler';

export const POST = createCrashRequestHandler({ agent });
