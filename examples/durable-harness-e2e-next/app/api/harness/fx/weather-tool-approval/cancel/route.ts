import { agent } from '@/agent/fx/weather-tool-approval';
import { createCancelRequestHandler } from '@/lib/create-cancel-request-handler';

export const POST = createCancelRequestHandler({ agent });
