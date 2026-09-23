'use client';

import { useState } from 'react';
import { createPlaygroundBackup } from '@/lib/playground-backup';
import { PLAYGROUND_ORIGIN } from '@/lib/playground-urls';

export function PlaygroundRecovery() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <h1 className="text-2xl font-semibold">Recover your playground</h1>
      <p>
        The playground has moved. Download your saved model panels, settings,
        and unsent draft from this browser, then import the file on the new
        playground.
      </p>
      <p>
        Open this page at{' '}
        <a className="underline" href="https://ai-sdk.dev/playground-recovery">
          ai-sdk.dev/playground-recovery
        </a>{' '}
        in the same browser and profile you used before the move. Other domains
        and Preview deployments cannot read that browser data.
      </p>
      <button
        type="button"
        className="rounded-md border px-4 py-2 text-sm"
        onClick={() => {
          setError('');
          try {
            const { backup, count } = createPlaygroundBackup(
              localStorage,
              location.origin,
            );
            if (!count) {
              setMessage(
                'No saved playground settings or draft were found on this origin in this browser.',
              );
              return;
            }
            const url = URL.createObjectURL(
              new Blob([backup], { type: 'application/json' }),
            );
            const link = document.createElement('a');
            link.href = url;
            link.download = 'ai-sdk-playground-backup.json';
            link.click();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            setMessage(
              'Backup downloaded. Import it on the new playground. Your data remains in this browser.',
            );
          } catch {
            setError(
              'Could not create a backup. Allow browser storage for this site and check that your data is within the 5 MB limit.',
            );
          }
        }}
      >
        Download playground backup
      </button>
      {message && <p role="status">{message}</p>}
      {error && <p role="alert">{error}</p>}
      <a className="underline" href={`${PLAYGROUND_ORIGIN}/recover`}>
        Import backup on the new playground
      </a>
      <p>
        The file stays on your device until you import it. Keep it private: it
        can contain draft text and attachment links. No session cookies are
        transferred.
      </p>
      <p>
        Sign in with the same Vercel account on the playground to access saved
        history and custom models. Messages that existed only in an open tab
        were not saved in browser storage; copy them before closing that tab.
      </p>
    </main>
  );
}
