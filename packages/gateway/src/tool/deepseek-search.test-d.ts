import type { InferToolInput, InferToolOutput } from '@ai-sdk/provider-utils';
import { expectTypeOf } from 'vitest';
import { gatewayTools } from '../gateway-tools';
import type {
  DeepSeekSearchConfig,
  DeepSeekSearchInput,
  DeepSeekSearchOutput,
  DeepSeekSearchResponse,
  DeepSeekSearchResult,
} from './deepseek-search';
import type { GatewayToolError } from './gateway-tool-error';

const search = gatewayTools.deepseekSearch();

expectTypeOf<
  InferToolInput<typeof search>
>().toEqualTypeOf<DeepSeekSearchInput>();
expectTypeOf<
  InferToolOutput<typeof search>
>().toEqualTypeOf<DeepSeekSearchOutput>();
expectTypeOf<DeepSeekSearchOutput>().toEqualTypeOf<
  DeepSeekSearchResponse | GatewayToolError
>();
expectTypeOf<Parameters<typeof gatewayTools.deepseekSearch>>().toEqualTypeOf<
  [config?: DeepSeekSearchConfig]
>();
expectTypeOf<DeepSeekSearchConfig['count']>().toEqualTypeOf<
  number | undefined
>();
expectTypeOf<DeepSeekSearchConfig['query']>().toEqualTypeOf<
  string | undefined
>();
expectTypeOf<DeepSeekSearchConfig>().not.toHaveProperty('need_content');
expectTypeOf<DeepSeekSearchConfig['needContent']>().toEqualTypeOf<
  boolean | undefined
>();
expectTypeOf<DeepSeekSearchConfig['oriQuestion']>().toEqualTypeOf<
  string | null | undefined
>();
expectTypeOf<DeepSeekSearchConfig['localization']>().toEqualTypeOf<
  string | undefined
>();
expectTypeOf<DeepSeekSearchInput['need_content']>().toEqualTypeOf<
  boolean | undefined
>();
expectTypeOf<DeepSeekSearchInput>().not.toHaveProperty('localization');
expectTypeOf<DeepSeekSearchResult['url']>().toEqualTypeOf<
  string | null | undefined
>();
expectTypeOf<DeepSeekSearchResponse['results']>().toEqualTypeOf<
  DeepSeekSearchResult[]
>();
