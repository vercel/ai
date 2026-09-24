import {
  loadOptionalSetting,
  withoutTrailingSlash,
} from '@ai-sdk/provider-utils';

const AWS_PARTITION_DNS_SUFFIXES = [
  { regionPrefix: 'cn-', dnsSuffix: 'amazonaws.com.cn' },
  { regionPrefix: 'us-iso-', dnsSuffix: 'c2s.ic.gov' },
  { regionPrefix: 'us-isob-', dnsSuffix: 'sc2s.sgov.gov' },
  { regionPrefix: 'eu-isoe-', dnsSuffix: 'cloud.adc-e.uk' },
  { regionPrefix: 'us-isof-', dnsSuffix: 'csp.hci.ic.gov' },
  { regionPrefix: 'eusc-', dnsSuffix: 'amazonaws.eu' },
] as const;

export function resolveAmazonBedrockBaseURL({
  baseURL,
  getRegion,
  service,
  serviceEndpointUrlEnvironmentVariableName,
}: {
  baseURL: string | undefined;
  getRegion: () => string;
  service: 'bedrock-runtime' | 'bedrock-agent-runtime';
  serviceEndpointUrlEnvironmentVariableName:
    | 'AWS_ENDPOINT_URL_BEDROCK_RUNTIME'
    | 'AWS_ENDPOINT_URL_BEDROCK_AGENT_RUNTIME';
}): string {
  const resolvedBaseURL =
    baseURL ??
    loadOptionalSetting({
      settingValue: undefined,
      environmentVariableName: serviceEndpointUrlEnvironmentVariableName,
    }) ??
    loadOptionalSetting({
      settingValue: undefined,
      environmentVariableName: 'AWS_ENDPOINT_URL',
    });

  if (resolvedBaseURL != null) {
    return withoutTrailingSlash(resolvedBaseURL) ?? resolvedBaseURL;
  }

  const region = getRegion();
  const dnsSuffix =
    AWS_PARTITION_DNS_SUFFIXES.find(({ regionPrefix }) =>
      region.startsWith(regionPrefix),
    )?.dnsSuffix ?? 'amazonaws.com';
  const generatedBaseURL = `https://${service}.${region}.${dnsSuffix}`;

  return withoutTrailingSlash(generatedBaseURL) ?? generatedBaseURL;
}
