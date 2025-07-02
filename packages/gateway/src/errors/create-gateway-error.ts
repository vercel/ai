import { z } from 'zod/v4';
import type { GatewayError } from './gateway-error';
import { GatewayAuthenticationError } from './gateway-authentication-error';
import { GatewayInvalidRequestError } from './gateway-invalid-request-error';
import { GatewayRateLimitError } from './gateway-rate-limit-error';
import {
  GatewayModelNotFoundError,
  modelNotFoundParamSchema,
} from './gateway-model-not-found-error';
import { GatewayInternalServerError } from './gateway-internal-server-error';
import { GatewayResponseError } from './gateway-response-error';

export function createGatewayErrorFromResponse({
  response,
  statusCode,
  defaultMessage = 'Gateway request failed',
  cause,
  authMethod,
}: {
  response: unknown;
  statusCode: number;
  defaultMessage?: string;
  cause?: unknown;
  authMethod?: 'api-key' | 'oidc';
}): GatewayError {
  const parseResult = gatewayErrorResponseSchema.safeParse(response);
  if (!parseResult.success) {
    return new GatewayResponseError({
      message: `Invalid error response format: ${defaultMessage}`,
      statusCode,
      response,
      validationError: parseResult.error,
      cause,
    });
  }

  const validatedResponse: GatewayErrorResponse = parseResult.data;
  const errorType = validatedResponse.error.type;
  const message = validatedResponse.error.message;

  switch (errorType) {
    case 'authentication_error':
      return GatewayAuthenticationError.createContextualError({
        apiKeyProvided: authMethod === 'api-key',
        oidcTokenProvided: authMethod === 'oidc',
        statusCode,
        cause,
      });
    case 'invalid_request_error':
      return new GatewayInvalidRequestError({ message, statusCode, cause });
    case 'rate_limit_exceeded':
      return new GatewayRateLimitError({ message, statusCode, cause });
    case 'model_not_found': {
      const modelResult = modelNotFoundParamSchema.safeParse(
        validatedResponse.error.param,
      );
      return new GatewayModelNotFoundError({
        message,
        statusCode,
        modelId: modelResult.success ? modelResult.data.modelId : undefined,
        cause,
      });
    }
    case 'internal_server_error':
      return new GatewayInternalServerError({ message, statusCode, cause });
    default:
      return new GatewayInternalServerError({ message, statusCode, cause });
  }
}

const gatewayErrorResponseSchema = z.object({
  error: z.object({
    message: z.string(),
    type: z.string().nullish(),
    param: z.unknown().nullish(),
    code: z.union([z.string(), z.number()]).nullish(),
  }),
});

export type GatewayErrorResponse = z.infer<typeof gatewayErrorResponseSchema>;
