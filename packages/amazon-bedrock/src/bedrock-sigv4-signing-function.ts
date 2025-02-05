import { loadOptionalSetting, loadSetting } from '@ai-sdk/provider-utils';
import { BedrockSigningFunction } from './bedrock-api-types';
import { AwsSigV4Signer } from './bedrock-sigv4-signer';

/**
Settings for the Bedrock signing function.
 */
export interface SigV4Settings {
  region?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

/**
Creates a Bedrock signing function that signs requests using AWS Signature Version 4.
@param settings - The settings for the signing function.
@returns A Bedrock signing function.
 */
export function createSigV4SigningFunction(
  settings: SigV4Settings = {},
): BedrockSigningFunction {
  return async ({ url, headers, body }) => {
    const region = loadSetting({
      settingValue: settings.region,
      settingName: 'region',
      environmentVariableName: 'AWS_REGION',
      description: 'AWS region',
    });

    const accessKeyId = loadSetting({
      settingValue: settings.accessKeyId,
      settingName: 'accessKeyId',
      environmentVariableName: 'AWS_ACCESS_KEY_ID',
      description: 'AWS access key ID',
    });

    const secretAccessKey = loadSetting({
      settingValue: settings.secretAccessKey,
      settingName: 'secretAccessKey',
      environmentVariableName: 'AWS_SECRET_ACCESS_KEY',
      description: 'AWS secret access key',
    });

    const sessionToken = loadOptionalSetting({
      settingValue: settings.sessionToken,
      environmentVariableName: 'AWS_SESSION_TOKEN',
    });

    const signer = new AwsSigV4Signer({
      region,
      service: 'bedrock',
      credentials: {
        accessKeyId,
        secretAccessKey,
        sessionToken,
      },
    });

    return signer.signRequest({
      method: 'POST',
      url,
      headers,
      // TODO: explore avoiding the below stringify since we do it again at
      // post-time and the content could be large with attachments.
      body: JSON.stringify(body),
    });
  };
}
