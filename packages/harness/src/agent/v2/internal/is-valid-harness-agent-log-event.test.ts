import { describe, expect, test } from 'vitest';
import type { SerializableValue } from '@ai-sdk/provider';
import { isValidHarnessAgentLogEvent } from './is-valid-harness-agent-log-event';

describe('isValidHarnessAgentLogEvent', () => {
  test.each([
    'submission',
    'effect-start',
    'effect-progress',
    'effect-end',
    'finish-step',
    'finish-turn',
    'harness:journal',
    'harness:custom:event',
    'harness:',
  ])('accepts common fields with supported event type %s', type => {
    expect(isValidHarnessAgentLogEvent({ type, id: 'event', data: null })).toBe(
      true,
    );
  });

  test('checks data presence without validating variant-specific payloads', () => {
    expect(
      isValidHarnessAgentLogEvent({
        type: 'effect-start',
        id: '',
        data: undefined,
      }),
    ).toBe(true);
    expect(
      isValidHarnessAgentLogEvent({
        type: 'harness:custom',
        id: 'event',
        data: new Map([['value', 42n]]),
      }),
    ).toBe(true);
  });

  test.each<SerializableValue>([
    undefined,
    null,
    false,
    42,
    42n,
    'submission',
    [],
    new Date(0),
    new Map(),
    {},
    { id: 'event', data: null },
    { type: null, id: 'event', data: null },
    { type: 42, id: 'event', data: null },
    { type: 'submission', data: null },
    { type: 'submission', id: null, data: null },
    { type: 'submission', id: 42, data: null },
    { type: 'submission', id: 'event' },
  ])('rejects missing or invalid common fields: %s', value => {
    expect(isValidHarnessAgentLogEvent(value)).toBe(false);
  });

  test.each([
    'unknown',
    'harness',
    'other:journal',
    'constructor',
    'toString',
    '__proto__',
  ])('rejects unsupported event type %s despite valid common fields', type => {
    expect(isValidHarnessAgentLogEvent({ type, id: 'event', data: null })).toBe(
      false,
    );
  });
});
