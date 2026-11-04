'use client';

import HarnessToolView from '@/components/tool/harness-tool-view';
import type { GetUserNameUIToolInvocation } from '@/lib/tools/get-user-name-tool';
import { useState, type FormEvent } from 'react';

export default function GetUserNameToolView({
  invocation,
  onSubmit,
}: {
  invocation: GetUserNameUIToolInvocation;
  onSubmit: (options: { toolCallId: string; name: string }) => void;
}) {
  const [name, setName] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const inputId = `user-name-${invocation.toolCallId}`;

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedName = name.trim();
    if (trimmedName.length === 0 || submitted) {
      return;
    }

    setSubmitted(true);
    onSubmit({ toolCallId: invocation.toolCallId, name: trimmedName });
  };

  if (invocation.state === 'input-available') {
    return (
      <div className="mb-2">
        <HarnessToolView toolName="Get user name" state={invocation.state} />
        <form className="flex gap-2 ml-4" onSubmit={handleSubmit}>
          <label className="sr-only" htmlFor={inputId}>
            Your name
          </label>
          <input
            id={inputId}
            type="text"
            autoComplete="name"
            autoFocus
            className="px-2 py-1 text-sm rounded border border-gray-300"
            placeholder="Enter your name"
            value={name}
            disabled={submitted}
            onChange={event => setName(event.target.value)}
          />
          <button
            type="submit"
            className="px-2 py-1 text-xs text-white bg-blue-600 rounded disabled:cursor-not-allowed disabled:bg-gray-400"
            disabled={name.trim().length === 0 || submitted}
          >
            Submit
          </button>
        </form>
      </div>
    );
  }

  return (
    <HarnessToolView
      toolName="Get user name"
      state={invocation.state}
      output={
        invocation.state === 'output-available'
          ? `Name: ${invocation.output.name}`
          : undefined
      }
      errorText={invocation.errorText}
    />
  );
}
