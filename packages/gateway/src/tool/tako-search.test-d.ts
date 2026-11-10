import type { InferToolInput, InferToolOutput } from '@ai-sdk/provider-utils';
import { expectTypeOf } from 'vitest';
import { gatewayTools } from '../gateway-tools';
import type {
  TakoCard,
  TakoResultContent,
  TakoSearchConfig,
  TakoSearchInput,
  TakoSearchOutput,
  TakoSearchResponse,
  TakoWebResult,
} from './tako-search';

const search = gatewayTools.takoSearch();

expectTypeOf<InferToolInput<typeof search>>().toEqualTypeOf<TakoSearchInput>();
expectTypeOf<
  InferToolOutput<typeof search>
>().toEqualTypeOf<TakoSearchOutput>();

expectTypeOf<TakoSearchConfig['variableCost']>().toEqualTypeOf<
  boolean | undefined
>();
expectTypeOf<TakoSearchConfig['maxVariableCostUsd']>().toEqualTypeOf<
  number | null | undefined
>();
expectTypeOf<TakoSearchConfig['extraBody']>().toEqualTypeOf<
  Record<string, unknown> | undefined
>();
expectTypeOf<TakoSearchConfig>().not.toHaveProperty('variable_cost');
expectTypeOf<TakoSearchInput>().not.toHaveProperty('variable_cost');
expectTypeOf<TakoSearchInput>().not.toHaveProperty('max_variable_cost_usd');
expectTypeOf<TakoSearchInput>().not.toHaveProperty('extra_body');
expectTypeOf<TakoSearchInput>().not.toHaveProperty('variableCost');
expectTypeOf<TakoSearchInput>().not.toHaveProperty('maxVariableCostUsd');
expectTypeOf<TakoSearchInput>().not.toHaveProperty('extraBody');

expectTypeOf<TakoCard['relevance_score']>().toEqualTypeOf<
  number | null | undefined
>();
expectTypeOf<
  NonNullable<TakoCard['placeholder']>['withheld_source']
>().toEqualTypeOf<string>();
expectTypeOf<NonNullable<TakoCard['placeholder']>['reason']>().toEqualTypeOf<
  'not_served' | 'over_cap' | null | undefined
>();

expectTypeOf<TakoResultContent['premium_rows']>().toEqualTypeOf<
  Record<string, number> | null | undefined
>();
expectTypeOf<TakoResultContent['redacted_cells']>().toEqualTypeOf<
  Record<string, number[]> | null | undefined
>();
expectTypeOf<TakoResultContent['total_matching']>().toEqualTypeOf<
  number | null | undefined
>();

type ExportPricing = NonNullable<TakoResultContent['export_pricing']>;
expectTypeOf<ExportPricing>().not.toHaveProperty('free_rows');
expectTypeOf<ExportPricing['variable_cost_max_usd']>().toEqualTypeOf<
  number | null | undefined
>();
expectTypeOf<ExportPricing['premium_row_cpm_usd']>().toEqualTypeOf<
  Record<string, number> | null | undefined
>();

type Usage = NonNullable<TakoSearchResponse['usage']>;
expectTypeOf<
  NonNullable<Usage['variable_cost']>['cost_usd']
>().toEqualTypeOf<number>();
expectTypeOf<NonNullable<Usage['data']>['data_points']>().toEqualTypeOf<
  number | null | undefined
>();

expectTypeOf<TakoWebResult>().not.toHaveProperty('citation_number');
