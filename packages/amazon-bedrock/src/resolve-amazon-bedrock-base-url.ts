import { InvalidArgumentError } from '@ai-sdk/provider';
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

// The region becomes part of the request host, so only a single DNS label is
// accepted (e.g. `evil.example.com/#` would rewrite the host).
const REGION_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i;

function validateRegion(region: string): string {
  if (!REGION_PATTERN.test(region)) {
    throw new InvalidArgumentError({
      argument: 'region',
      message:
        'Invalid AWS region. Expected a single DNS label (letters, digits, and hyphens). Use `baseURL`, `AWS_ENDPOINT_URL`, or `AWS_ENDPOINT_URL_BEDROCK_RUNTIME` for custom endpoints.',
    });
  }

  return region;
}

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

  const region = validateRegion(getRegion());
  const dnsSuffix =
    AWS_PARTITION_DNS_SUFFIXES.find(({ regionPrefix }) =>
      region.startsWith(regionPrefix),
    )?.dnsSuffix ?? 'amazonaws.com';
  const generatedBaseURL = `https://${service}.${region}.${dnsSuffix}`;

  return withoutTrailingSlash(generatedBaseURL) ?? generatedBaseURL;
}
