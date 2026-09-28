/**
 * Authentication-related environment variables supplied directly to a harness.
 *
 * When used as an adapter's `auth` option, this environment replaces the host
 * process environment for authentication discovery.
 */
export type HarnessV1AuthenticationEnvironment = Readonly<
  Record<string, string>
>;

/**
 * Authentication options shared by harness adapters. Adapter choices must be
 * a non-empty union of concrete string values.
 */
export type HarnessV1Authentication<ADAPTER_CHOICES extends string = 'direct'> =
  [ADAPTER_CHOICES] extends [never]
    ? never
    : string extends ADAPTER_CHOICES
      ? never
      :
          | 'auto'
          | 'ai-gateway'
          | ADAPTER_CHOICES
          | HarnessV1AuthenticationEnvironment;
