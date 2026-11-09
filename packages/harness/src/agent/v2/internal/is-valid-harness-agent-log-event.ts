import type { SerializableValue } from '@ai-sdk/provider';
import type { HarnessAgentLogEvent } from './types';

/**
 * Exhaustive fixed event types from HarnessAgentLogEvent. Adding or removing a
 * fixed type requires updating this table; namespace variants are checked in
 * isValidHarnessAgentLogEvent instead.
 */
const eventTypes = {
  submission: true,
  'effect-start': true,
  'effect-progress': true,
  'effect-end': true,
  'finish-step': true,
  'finish-turn': true,
} satisfies Record<
  Exclude<HarnessAgentLogEvent['type'], `harness:${string}`>,
  true
>;

/**
 * Checks the common stored event fields and supported event type, not the
 * variant-specific data payload. This is deliberately not a type predicate.
 * Keep these checks aligned with HarnessAgentLogEvent in types.ts: fixed types
 * are enforced by the table, but common-field and namespace changes also
 * require updating this function and its tests.
 */
export function isValidHarnessAgentLogEvent(value: SerializableValue): boolean {
  return (
    value != null &&
    typeof value === 'object' &&
    'type' in value &&
    typeof value.type === 'string' &&
    'data' in value &&
    'id' in value &&
    typeof value.id === 'string' &&
    (Object.hasOwn(eventTypes, value.type) || value.type.startsWith('harness:'))
  );
}
