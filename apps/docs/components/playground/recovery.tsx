'use client';

import { useState } from 'react';
import { createPlaygroundBackup } from '@/lib/playground-backup';
import { PLAYGROUND_ORIGIN } from '@/lib/playground-urls';

export const PlaygroundRecovery = () => {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const downloadBackup = () => {
    setError('');

    try {
      const { backup, count } = createPlaygroundBackup(
        localStorage,
        location.origin,
      );

      if (!count) {
        setMessage(
          'No saved playground settings or draft were found in this browser.',
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
  };

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-6 py-12">
      <h1 className="text-3xl font-semibold tracking-tight">
        Recover your playground settings
      </h1>
      <p>
        The AI SDK Playground has moved. Download your saved model panels,
        settings, and pre-sign-in draft from this browser, then import the file
        on the new playground.
      </p>
      <p>
        Open this page on <code>ai-sdk.dev</code> in the same browser profile
        you used before the move. Other domains and Preview deployments cannot
        read that browser data.
      </p>
      <button
        className="w-fit rounded-md border border-gray-400 bg-background-100 px-4 py-2 text-sm hover:bg-background-200"
        onClick={downloadBackup}
        type="button"
      >
        Download playground backup
      </button>
      {message ? <p role="status">{message}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      <a className="w-fit underline" href={`${PLAYGROUND_ORIGIN}/recover`}>
        Import the backup on the new playground
      </a>
      <p>
        The backup can contain draft text and attachment links. Keep it private.
        Authentication data and session cookies are not included.
      </p>
      <p>
        Sign in with the same Vercel account to access saved history and custom
        models. Copy messages that exist only in an open tab before reloading
        it, because those messages were never saved in browser storage.
      </p>
    </main>
  );
};
