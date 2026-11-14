'use client';

import { useChatId } from '@/components/chat-id-provider';
import {
  HARNESSES,
  isHarnessName,
  readHarnessPreference,
  writeHarnessPreference,
  type HarnessName,
} from '@/lib/harness';
import { useEffect, useState, type FormEvent } from 'react';

/**
 * Dialog that starts a new session on the selected harness. The selection
 * is saved as the default for later sessions as soon as it changes.
 */
export default function NewSessionDialog({ onClose }: { onClose: () => void }) {
  const { startNewSession } = useChatId();
  const [harness, setHarness] = useState<HarnessName>(readHarnessPreference);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | undefined>();

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !starting) onClose();
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, starting]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStarting(true);
    setError(undefined);
    try {
      await startNewSession({ harness });
    } catch (startError) {
      setError(
        startError instanceof Error ? startError.message : String(startError),
      );
      setStarting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onMouseDown={event => {
        if (event.target === event.currentTarget && !starting) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-session-title"
        className="w-full max-w-sm p-5 bg-white rounded-lg shadow-xl"
        onSubmit={event => void handleSubmit(event)}
      >
        <h2 id="new-session-title" className="mb-4 text-lg font-semibold">
          New session
        </h2>

        <label
          htmlFor="new-session-harness"
          className="block mb-1 text-sm font-medium"
        >
          Harness
        </label>
        <select
          id="new-session-harness"
          className="w-full p-2 mb-4 border border-gray-300 rounded"
          value={harness}
          disabled={starting}
          autoFocus
          onChange={event => {
            const value = event.target.value;
            if (!isHarnessName(value)) return;
            setHarness(value);
            writeHarnessPreference({ harness: value });
          }}
        >
          {HARNESSES.map(({ name, label }) => (
            <option key={name} value={name}>
              {label}
            </option>
          ))}
        </select>

        {error && (
          <p
            role="alert"
            className="mb-4 text-sm text-red-600 whitespace-pre-wrap break-words"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-2 text-sm border border-gray-300 rounded"
            disabled={starting}
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="px-3 py-2 text-sm text-white bg-black rounded disabled:opacity-60"
            disabled={starting}
          >
            {starting ? 'Starting…' : 'Start session'}
          </button>
        </div>
      </form>
    </div>
  );
}
