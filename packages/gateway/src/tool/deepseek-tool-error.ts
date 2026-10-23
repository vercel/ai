import { z } from '../zod';

export interface DeepSeekToolError {
  error:
    | 'api_error'
    | 'configuration_error'
    | 'execution_error'
    | 'gateway_rate_limit'
    | 'invalid_input'
    | 'rate_limit'
    | 'timeout'
    | 'unknown_tool';
  message: string;
  statusCode?: number;
  retryAfter?: string;
}

export const deepseekToolErrorSchema = z.object({
  error: z.enum([
    'api_error',
    'configuration_error',
    'execution_error',
    'gateway_rate_limit',
    'invalid_input',
    'rate_limit',
    'timeout',
    'unknown_tool',
  ]),
  message: z.string(),
  statusCode: z.number().optional(),
  retryAfter: z.string().optional(),
});
