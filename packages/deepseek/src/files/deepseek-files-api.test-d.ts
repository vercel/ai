import type { InferSchema } from '@ai-sdk/provider-utils';
import { expectTypeOf } from 'vitest';
import type { deepSeekFilesResponseSchema } from './deepseek-files-api';

type DeepSeekFilesResponse = InferSchema<typeof deepSeekFilesResponseSchema>;

expectTypeOf<DeepSeekFilesResponse['object']>().toEqualTypeOf<
  'file' | null | undefined
>();
expectTypeOf<DeepSeekFilesResponse['purpose']>().toEqualTypeOf<
  'user_data' | null | undefined
>();
