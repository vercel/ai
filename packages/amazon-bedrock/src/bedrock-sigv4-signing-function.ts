import { loadOptionalSetting, loadSetting } from '@ai-sdk/provider-utils';
import { BedrockSigningFunction } from './bedrock-api-types';
import { AwsV4Signer } from 'aws4fetch';

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

    const signer = new AwsV4Signer({
      url,
      method: 'POST',
      headers: Object.entries(headers).filter(([_, v]) => v !== undefined) as [
        string,
        string,
      ][],
      // TODO: explore avoiding the below stringify since we do it again at
      // post-time and the content could be large with attachments.
      body: JSON.stringify(body),
      region,
      accessKeyId,
      secretAccessKey,
      ...(sessionToken && { sessionToken }),
      service: 'bedrock',
    });

    const result = await signer.sign();
    const signedHeaders: Record<string, string | undefined> = {};
    result.headers.forEach((v, k) => (signedHeaders[k] = v));
    return signedHeaders;
  };
}
