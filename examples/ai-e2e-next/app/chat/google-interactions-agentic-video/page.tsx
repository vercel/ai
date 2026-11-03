'use client';

import { Response } from '@/components/ai-elements/response';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import { useRef, useState, type FormEvent } from 'react';

const MAX_VIDEO_SIZE = 15 * 1024 * 1024;
const transport = new DefaultChatTransport({
  api: '/api/chat/google-interactions-agentic-video',
});

export default function Chat() {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<FileList>();
  const [fileError, setFileError] = useState<string>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { error, messages, sendMessage, status, stop } = useChat({
    transport,
  });

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = input.trim();
    if (text.length === 0 || status !== 'ready') {
      return;
    }

    sendMessage({ text, files });
    setInput('');
    setFiles(undefined);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }

  return (
    <main className="flex flex-col w-full max-w-2xl min-h-screen gap-6 px-4 py-12 mx-auto">
      <header>
        <h1 className="text-2xl font-bold">
          Google Interactions agentic video
        </h1>
        <p className="mt-2 text-sm text-zinc-600">
          Attach a short video (up to 15 MB), ask a question, then continue the
          conversation without attaching it again. Follow-up turns reference the
          stored Gemini interaction, so the video is not uploaded again.
        </p>
      </header>

      <section className="flex flex-col flex-1 gap-4">
        {messages.map(message => (
          <article
            key={message.id}
            className="p-4 border rounded-lg border-zinc-200"
          >
            <div className="mb-2 text-xs font-semibold uppercase text-zinc-500">
              {message.role}
            </div>
            <div className="flex flex-col gap-3">
              {message.parts.map((part, index) => {
                if (part.type === 'text') {
                  return <Response key={index}>{part.text}</Response>;
                }

                if (
                  part.type === 'file' &&
                  part.mediaType.startsWith('video/')
                ) {
                  return (
                    <div key={index}>
                      {/* eslint-disable-next-line jsx-a11y/media-has-caption -- User-provided videos do not include a captions track. */}
                      <video
                        className="w-full rounded-md"
                        src={part.url}
                        controls
                      />
                      <div className="mt-1 text-xs text-zinc-500">
                        {part.filename ?? part.mediaType}
                      </div>
                    </div>
                  );
                }

                if (
                  part.type === 'custom' &&
                  (part.kind === 'google.processing_call' ||
                    part.kind === 'google.processing_result')
                ) {
                  const google = part.providerMetadata?.google as
                    | {
                        processingId?: string;
                        processingCallId?: string;
                      }
                    | undefined;
                  const id =
                    part.kind === 'google.processing_call'
                      ? google?.processingId
                      : google?.processingCallId;

                  return (
                    <div
                      key={index}
                      className="px-3 py-2 font-mono text-xs rounded bg-blue-50 text-blue-700"
                    >
                      {part.kind}
                      {id ? ` · ${id}` : ''}
                    </div>
                  );
                }

                if (part.type === 'reasoning' && part.text.length > 0) {
                  return (
                    <details key={index} className="text-sm text-zinc-500">
                      <summary>Reasoning</summary>
                      <div className="mt-2 whitespace-pre-wrap">
                        {part.text}
                      </div>
                    </details>
                  );
                }

                return null;
              })}
            </div>
          </article>
        ))}
      </section>

      {error ? (
        <div className="text-sm text-red-600">{error.message}</div>
      ) : null}

      <form
        onSubmit={handleSubmit}
        className="sticky bottom-0 flex flex-col gap-3 p-4 bg-white border rounded-lg shadow-sm border-zinc-200"
      >
        <label className="text-sm font-medium">
          Video
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            className="block w-full mt-1 text-sm"
            disabled={status !== 'ready'}
            onChange={event => {
              const selectedFiles = event.target.files;
              const video = selectedFiles?.item(0);
              if (video != null && video.size > MAX_VIDEO_SIZE) {
                setFiles(undefined);
                setFileError('Choose a video smaller than 15 MB.');
                event.target.value = '';
                return;
              }
              setFiles(selectedFiles ?? undefined);
              setFileError(undefined);
            }}
          />
        </label>
        {fileError ? (
          <div className="text-sm text-red-600">{fileError}</div>
        ) : null}
        {files?.item(0) ? (
          <div className="text-xs text-zinc-500">
            Attached: {files.item(0)?.name}
          </div>
        ) : null}
        <div className="flex gap-2">
          <input
            value={input}
            placeholder="Ask about the video..."
            onChange={event => setInput(event.target.value)}
            className="flex-1 px-3 py-2 border rounded-md border-zinc-300"
            disabled={status !== 'ready'}
          />
          {status === 'submitted' || status === 'streaming' ? (
            <button
              type="button"
              onClick={stop}
              className="px-4 py-2 border rounded-md border-zinc-300"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              disabled={input.trim().length === 0}
              className="px-4 py-2 text-white bg-black rounded-md disabled:opacity-50"
            >
              Send
            </button>
          )}
        </div>
      </form>
    </main>
  );
}
