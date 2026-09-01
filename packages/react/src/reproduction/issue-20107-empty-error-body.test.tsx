import { act, renderHook, waitFor } from '@testing-library/react';
import { jsonSchema } from 'ai';
import { expect, it } from 'vitest';
import { useObject } from '../use-object';

it('surfaces a non-empty error message for an empty HTTP error response', async () => {
  const { result } = renderHook(() =>
    useObject({
      api: '/api/object',
      schema: jsonSchema<{ value: string }>({
        type: 'object',
        properties: { value: { type: 'string' } },
        required: ['value'],
        additionalProperties: false,
      }),
      fetch: async () => new Response(null, { status: 502 }),
    }),
  );

  act(() => {
    result.current.submit({});
  });

  await waitFor(() => {
    expect(result.current.error).toBeInstanceOf(Error);
  });
  expect(
    result.current.error?.message.trim().length,
    'ISSUE20107_REACT_EXPECTED_NON_EMPTY_ERROR_MESSAGE',
  ).toBeGreaterThan(0);
});
