import type { ProviderOptions, ToolResultOutput } from '@ai-sdk/provider-utils';

export function getToolResultProviderOptions({
  output,
  providerOptions,
}: {
  output: ToolResultOutput;
  providerOptions?: ProviderOptions;
}): ProviderOptions | undefined {
  return (
    providerOptions ??
    ('providerOptions' in output ? output.providerOptions : undefined)
  );
}
