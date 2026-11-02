import { describe, expect, it } from 'vitest';
import {
  startsWithStructuredValue,
  StreamingToolCallArgumentState,
} from './streaming-tool-call-argument-state';

describe('startsWithStructuredValue', () => {
  it.each(['{}', '  {', '[]', '\n['])('returns true for %j', value => {
    expect(startsWithStructuredValue(value)).toBe(true);
  });

  it.each([undefined, null, '', '   ', '1', '"value"'])(
    'returns false for %j',
    value => {
      expect(startsWithStructuredValue(value)).toBe(false);
    },
  );
});

describe('StreamingToolCallArgumentState', () => {
  it('tracks a structured value across deltas', () => {
    const state = new StreamingToolCallArgumentState('  {"value":');

    expect(state.hasCompleteStructuredValue).toBe(false);

    state.append('1}');

    expect(state.hasCompleteStructuredValue).toBe(true);
  });

  it('tracks nested objects and arrays', () => {
    const state = new StreamingToolCallArgumentState(
      '[{"value":{"items":[1,2]}}]',
    );

    expect(state.hasCompleteStructuredValue).toBe(true);
  });

  it('ignores structural characters inside strings', () => {
    const state = new StreamingToolCallArgumentState(
      '{"value":"braces: } ] { ["}',
    );

    expect(state.hasCompleteStructuredValue).toBe(true);
  });

  it('handles escaped quotes across deltas', () => {
    const state = new StreamingToolCallArgumentState(
      '{"value":"escaped quote: \\"',
    );

    expect(state.hasCompleteStructuredValue).toBe(false);

    state.append(' still in string"}');

    expect(state.hasCompleteStructuredValue).toBe(true);
  });

  it('can begin after an empty or whitespace-only delta', () => {
    const state = new StreamingToolCallArgumentState('  ');

    state.append('[');
    expect(state.hasCompleteStructuredValue).toBe(false);

    state.append(']');
    expect(state.hasCompleteStructuredValue).toBe(true);
  });

  it('does not treat scalar arguments as a complete structured value', () => {
    const state = new StreamingToolCallArgumentState('12');

    expect(state.hasCompleteStructuredValue).toBe(false);
  });

  it('does not recover mismatched structures as complete', () => {
    const state = new StreamingToolCallArgumentState('{"value":]');

    state.append('}');

    expect(state.hasCompleteStructuredValue).toBe(false);
  });
});
