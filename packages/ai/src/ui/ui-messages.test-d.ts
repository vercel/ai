import { expectTypeOf } from 'vitest';
import { ToolCallState } from './ui-messages';

// test ToolCallState type
expectTypeOf<ToolCallState>().toEqualTypeOf<
  | 'input-streaming'
  | 'input-available'
  | 'approval-requested'
  | 'approval-responded'
  | 'output-available'
  | 'output-error'
  | 'output-denied'
>();
