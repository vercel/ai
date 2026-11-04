import type { InferToolInput, InferToolOutput } from '@ai-sdk/provider-utils';
import { expectTypeOf } from 'vitest';
import { gatewayTools } from '../gateway-tools';
import type {
  DeepSeekFetchConfig,
  DeepSeekFetchInput,
  DeepSeekFetchOutput,
  DeepSeekFetchResponse,
} from './deepseek-fetch';
import type { GatewayToolError } from './gateway-tool-error';

const fetch = gatewayTools.deepseekFetch();

expectTypeOf<
  InferToolInput<typeof fetch>
>().toEqualTypeOf<DeepSeekFetchInput>();
expectTypeOf<
  InferToolOutput<typeof fetch>
>().toEqualTypeOf<DeepSeekFetchOutput>();
expectTypeOf<DeepSeekFetchOutput>().toEqualTypeOf<
  DeepSeekFetchResponse | GatewayToolError
>();
expectTypeOf<Parameters<typeof gatewayTools.deepseekFetch>>().toEqualTypeOf<
  [config?: DeepSeekFetchConfig]
>();
expectTypeOf<DeepSeekFetchConfig['url']>().toEqualTypeOf<string | undefined>();
expectTypeOf<DeepSeekFetchResponse['content']>().toEqualTypeOf<string>();
expectTypeOf<DeepSeekFetchResponse['title']>().toEqualTypeOf<
  string | null | undefined
>();
