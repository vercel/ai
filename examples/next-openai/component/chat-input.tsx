import { useState } from 'react';

export default function ChatInput({
  status,
  onSubmit,
  stop,
  placeholder = 'Say something...',
}: {
  status: string;
  onSubmit: (text: string) => void;
  stop?: () => void;
  placeholder?: string;
}) {
  const [text, setText] = useState('');

  return (
    <form
      onSubmit={e => {
        e.preventDefault();
        if (text.trim() === '') return;
        onSubmit(text);
        setText('');
      }}
    >
      <input
        className="fixed bottom-0 p-2 mb-8 w-full max-w-md rounded border border-gray-300 shadow-xl"
        placeholder={placeholder}
        disabled={status !== 'ready'}
        value={text}
        onChange={e => setText(e.target.value)}
      />
      {stop && (status === 'streaming' || status === 'submitted') && (
        <button
          className="fixed bottom-0 p-2 mb-8 w-full max-w-md rounded border border-gray-300 shadow-xl"
          type="submit"
          onClick={stop}
        >
          Stop
        </button>
      )}
    </form>
  );
}
