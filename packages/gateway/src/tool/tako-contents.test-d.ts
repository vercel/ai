import type { InferToolInput, InferToolOutput } from '@ai-sdk/provider-utils';
import { expectTypeOf } from 'vitest';
import { gatewayTools } from '../gateway-tools';
import type { GatewayToolError } from './gateway-tool-error';
import type {
  TakoContentItem,
  TakoContentsCell,
  TakoContentsConfig,
  TakoContentsInput,
  TakoContentsOutput,
  TakoContentsResponse,
} from './tako-contents';
import type { TakoContentFormat, TakoResultContent } from './tako-search';

const contents = gatewayTools.takoContents();

expectTypeOf<
  InferToolInput<typeof contents>
>().toEqualTypeOf<TakoContentsInput>();
expectTypeOf<
  InferToolOutput<typeof contents>
>().toEqualTypeOf<TakoContentsOutput>();
expectTypeOf<TakoContentsOutput>().toEqualTypeOf<
  TakoContentsResponse | GatewayToolError
>();
expectTypeOf<Parameters<typeof gatewayTools.takoContents>>().toEqualTypeOf<
  [config?: TakoContentsConfig]
>();

expectTypeOf<TakoContentsConfig['mode']>().toEqualTypeOf<
  'inline' | 'url' | undefined
>();
expectTypeOf<TakoContentsConfig['contentFormat']>().toEqualTypeOf<
  TakoContentFormat | undefined
>();
expectTypeOf<TakoContentsConfig['maxRows']>().toEqualTypeOf<
  number | undefined
>();
expectTypeOf<TakoContentsConfig['maxChars']>().toEqualTypeOf<
  number | undefined
>();
expectTypeOf<TakoContentsConfig['premium']>().toEqualTypeOf<
  boolean | undefined
>();
expectTypeOf<TakoContentsConfig['maxCostUsd']>().toEqualTypeOf<
  number | undefined
>();
expectTypeOf<TakoContentsConfig['extraBody']>().toEqualTypeOf<
  Record<string, unknown> | undefined
>();
expectTypeOf<TakoContentsConfig>().not.toHaveProperty('max_cost_usd');
expectTypeOf<TakoContentsConfig>().not.toHaveProperty('quoteOnly');

expectTypeOf<TakoContentsInput>().not.toHaveProperty('premium');
expectTypeOf<TakoContentsInput>().not.toHaveProperty('max_cost_usd');
expectTypeOf<TakoContentsInput>().not.toHaveProperty('extra_body');
expectTypeOf<TakoContentsInput>().not.toHaveProperty('maxCostUsd');
expectTypeOf<TakoContentsInput>().not.toHaveProperty('extraBody');

expectTypeOf<TakoContentItem['export_pricing']>().toEqualTypeOf<
  TakoResultContent['export_pricing']
>();
expectTypeOf<TakoContentItem['premium_rows']>().toEqualTypeOf<
  TakoResultContent['premium_rows']
>();
expectTypeOf<Array<{ a: number }>>().toMatchTypeOf<TakoContentsCell>();
expectTypeOf<
  NonNullable<TakoContentItem['records']>[number]['any']
>().toEqualTypeOf<TakoContentsCell>();
expectTypeOf<
  NonNullable<TakoContentItem['dataset']>['columns'][number]['type']
>().toEqualTypeOf<
  'array' | 'boolean' | 'date' | 'datetime' | 'number' | 'string'
>();
expectTypeOf<
  NonNullable<TakoContentItem['manifest']>[number]['premium_class']
>().toEqualTypeOf<string | null | undefined>();
expectTypeOf<TakoContentItem['source_url']>().toEqualTypeOf<string>();
expectTypeOf<TakoContentItem['delivery']>().toEqualTypeOf<
  'inline' | 'quote' | 'url' | undefined
>();
expectTypeOf<TakoContentItem['offset']>().toEqualTypeOf<
  number | null | undefined
>();
expectTypeOf<TakoContentItem['premium']>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<TakoContentsResponse['contents']>().toEqualTypeOf<
  TakoContentItem[] | undefined
>();

type Usage = NonNullable<TakoContentsResponse['usage']>;
expectTypeOf<NonNullable<Usage['data']>['data_points']>().toEqualTypeOf<
  number | null | undefined
>();
expectTypeOf<
  NonNullable<Usage['variable_cost']>['cost_usd']
>().toEqualTypeOf<number>();
