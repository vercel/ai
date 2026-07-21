import {
  loadOptionalSetting,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';

const AWS_PARTITION_DNS_SUFFIXES = [
  { regionPrefix: 'cn-', dnsSuffix: 'amazonaws.com.cn' },
  { regionPrefix: 'us-iso-', dnsSuffix: 'c2s.ic.gov' },
  { regionPrefix: 'us-isob-', dnsSuffix: 'sc2s.sgov.gov' },
] as const;

export function resolveAmazonBedrockBaseURL({
  baseURL,
  region,
  service,
  serviceEndpointUrlEnvironmentVariableName,
}: {
  baseURL: string | undefined;
  region: string;
  service: 'bedrock-runtime' | 'bedrock-agent-runtime';
  serviceEndpointUrlEnvironmentVariableName:
    | 'AWS_ENDPOINT_URL_BEDROCK_RUNTIME'
    | 'AWS_ENDPOINT_URL_BEDROCK_AGENT_RUNTIME';
}): string {
  const dnsSuffix =
    AWS_PARTITION_DNS_SUFFIXES.find(({ regionPrefix }) =>
      region.startsWith(regionPrefix),
    )?.dnsSuffix ?? 'amazonaws.com';

  const resolvedBaseURL =
    baseURL ??
    loadOptionalSetting({
      settingValue: undefined,
      environmentVariableName: serviceEndpointUrlEnvironmentVariableName,
    }) ??
    loadOptionalSetting({
      settingValue: undefined,
      environmentVariableName: 'AWS_ENDPOINT_URL',
    }) ??
    `https://${service}.${region}.${dnsSuffix}`;

  return withoutTrailingSlash(resolvedBaseURL) ?? resolvedBaseURL;
}
