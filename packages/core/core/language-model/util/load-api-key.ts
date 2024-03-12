import { LoadAPIKeyError } from '../errors/load-api-key-error';

export function loadApiKey({
  apiKey,
  environmentVariableName,
  apiKeyParameterName = 'apiKey',
  description,
}: {
  apiKey: string | undefined;
  environmentVariableName: string;
  apiKeyParameterName?: string;
  description: string;
}): string {
  if (apiKey != null) {
    return apiKey;
  }

  if (typeof process === 'undefined') {
    throw new LoadAPIKeyError({
      message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter. Environment variables is not supported in this environment.`,
    });
  }

  apiKey = process.env[environmentVariableName];

  if (apiKey == null) {
    throw new LoadAPIKeyError({
      message: `${description} API key is missing. Pass it using the '${apiKeyParameterName}' parameter or the ${environmentVariableName} environment variable.`,
    });
  }

  return apiKey;
}
