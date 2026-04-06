'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport, FileUIPart } from 'ai';
import { useRef, useState } from 'react';

export default function TestOpenResponsesPdfMultiStep() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [attachedFiles, setAttachedFiles] = useState<FileUIPart[]>([]);

  const { messages, sendMessage, status, error, regenerate, stop } = useChat({
    transport: new DefaultChatTransport({
      api: '/api/chat/open-responses-pdf-multi-step',
    }),
  });

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

    setAttachedFiles(prev => [
      ...prev,
      {
        type: 'file' as const,
        url: dataUrl,
        mediaType: file.type,
        filename: file.name,
      },
    ]);

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const input = form.querySelector('input[type="text"]') as HTMLInputElement;
    const text = input.value.trim();
    if (!text) return;

    sendMessage({
      text,
      files: attachedFiles.length > 0 ? attachedFiles : undefined,
    });
    input.value = '';
    setAttachedFiles([]);
  };

  return (
    <div className="flex flex-col w-full max-w-2xl py-12 mx-auto stretch">
      <h1 className="mb-4 text-xl font-bold">
        Open Responses — PDF Multi-Step Conversation Test
      </h1>
      <p className="mb-6 text-sm text-gray-500">
        Upload a PDF and ask questions. The model uses tools for multi-step
        responses, verifying non-image file parts work across conversation
        turns.
      </p>

      <div className="flex-1 overflow-y-auto mb-4">
        {messages.map(message => (
          <div key={message.id} className="whitespace-pre-wrap mb-4">
            <div className="font-semibold mb-1">
              {message.role === 'user' ? 'User:' : 'AI:'}
            </div>
            {message.parts.map((part, index) => {
              if (part.type === 'text') {
                return <div key={index}>{part.text}</div>;
              }
              if (part.type === 'file') {
                return (
                  <div
                    key={index}
                    className="text-xs text-gray-500 bg-gray-100 rounded px-2 py-1 inline-block mb-1"
                  >
                    {part.filename ?? 'file'}
                  </div>
                );
              }
              if (
                part.type === 'tool-summarizeSection' ||
                part.type === 'tool-extractKeyTerms'
              ) {
                return (
                  <div
                    key={index}
                    className="text-xs bg-yellow-50 border-l-2 border-yellow-300 text-yellow-800 px-2 py-1 mb-1"
                  >
                    <strong>Tool:</strong> {part.type.replace('tool-', '')}
                    {part.state === 'output-available' && (
                      <span className="ml-2 text-green-700">(completed)</span>
                    )}
                  </div>
                );
              }
              return null;
            })}
          </div>
        ))}
      </div>

      {(status === 'submitted' || status === 'streaming') && (
        <div className="mb-4 text-gray-500">
          {status === 'submitted' && <div>Loading...</div>}
          <button
            type="button"
            className="px-4 py-2 mt-2 text-blue-500 border border-blue-500 rounded-md"
            onClick={stop}
          >
            Stop
          </button>
        </div>
      )}

      {error && (
        <div className="mb-4">
          <div className="text-red-500">An error occurred.</div>
          <button
            type="button"
            className="px-4 py-2 mt-2 text-blue-500 border border-blue-500 rounded-md"
            onClick={() => regenerate()}
          >
            Retry
          </button>
        </div>
      )}

      {/* Attached files preview */}
      {attachedFiles.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {attachedFiles.map((file, i) => (
            <div
              key={i}
              className="flex items-center gap-1 text-xs bg-gray-100 rounded px-2 py-1"
            >
              <span>{file.filename ?? 'file'}</span>
              <button
                type="button"
                className="text-red-500 ml-1"
                onClick={() =>
                  setAttachedFiles(prev => prev.filter((_, j) => j !== i))
                }
              >
                x
              </button>
            </div>
          ))}
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="application/pdf,text/plain"
          className="text-sm"
        />
        <input
          type="text"
          className="flex-1 p-2 border border-gray-300 rounded"
          placeholder="Ask about the document..."
          disabled={status !== 'ready'}
        />
        <button
          type="submit"
          disabled={status !== 'ready'}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
