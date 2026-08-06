import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SWRConfig } from 'swr';
import { expect, test, vi } from 'vitest';
import { useCompletion } from './use-completion';

test('issue #7259: handleSubmit resets the input after submission', async () => {
  const fetch = vi.fn(async () => new Response('completed'));

  function CompletionForm() {
    const { handleInputChange, handleSubmit, input } = useCompletion({
      fetch,
      streamProtocol: 'text',
    });

    return (
      <form onSubmit={handleSubmit}>
        <input aria-label="Prompt" onChange={handleInputChange} value={input} />
      </form>
    );
  }

  render(
    <SWRConfig value={{ provider: () => new Map() }}>
      <CompletionForm />
    </SWRConfig>,
  );

  const input = screen.getByLabelText('Prompt') as HTMLInputElement;
  await userEvent.type(input, 'hello{enter}');

  await waitFor(() => expect(fetch).toHaveBeenCalledOnce());

  if (input.value !== '') {
    throw new Error(
      `Issue #7259 reproduced: expected useCompletion handleSubmit to clear the input after submission, but received "${input.value}"`,
    );
  }
});
