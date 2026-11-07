import { expectTypeOf } from 'vitest';
import type { AnthropicMessageMetadata } from './anthropic-message-metadata';

// Existing consumers can keep constructing metadata without a service tier.
expectTypeOf<
  Omit<AnthropicMessageMetadata, 'serviceTier'>
>().toMatchTypeOf<AnthropicMessageMetadata>();
