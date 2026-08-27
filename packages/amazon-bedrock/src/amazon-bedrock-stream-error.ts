export type AmazonBedrockStreamErrorType =
  | 'internalServerException'
  | 'modelStreamErrorException'
  | 'serviceUnavailableException'
  | 'throttlingException'
  | 'validationException';

export function getAmazonBedrockStreamErrorMetadata(type: string): {
  statusCode?: number;
  isRetryable?: boolean;
} {
  switch (type) {
    case 'internalServerException':
    case 'InternalServerException':
      return { statusCode: 500, isRetryable: true };
    case 'modelStreamErrorException':
    case 'ModelStreamErrorException':
      return { statusCode: 424, isRetryable: true };
    case 'serviceUnavailableException':
    case 'ServiceUnavailableException':
      return { statusCode: 503, isRetryable: true };
    case 'throttlingException':
    case 'ThrottlingException':
      return { statusCode: 429, isRetryable: true };
    case 'validationException':
    case 'ValidationException':
      return { statusCode: 400, isRetryable: false };
    default:
      return {};
  }
}
