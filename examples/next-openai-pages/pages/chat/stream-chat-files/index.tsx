/* eslint-disable @next/next/no-img-element */
import { useChat } from 'ai/react';
import { useRef, useState } from 'react';

export default function Page() {
  const { messages, input, handleSubmit, handleInputChange, isLoading } =
    useChat({
      api: '/api/stream-chat',
    });

  const [files, setFiles] = useState<FileList | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col p-2 gap-2">
        {messages.map(message => (
          <div key={message.id} className="flex flex-row gap-2">
            <div className="w-24 text-zinc-500 flex-shrink-0">{`${message.role}: `}</div>

            <div className="flex flex-col gap-2">
              {message.content}

              <div className="flex flex-row gap-2">
                {message.files?.map(
                  (file, index) =>
                    file.type === 'data-url' && (
                      <img
                        key={`${message.id}-${index}`}
                        className="w-24 rounded-md"
                        src={file.dataUrl}
                        alt="image"
                      />
                    ),
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={event => {
          handleSubmit(event, {
            files,
          });
          setFiles(undefined);

          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }}
        className="flex flex-col gap-2 fixed bottom-0 p-2 w-full"
      >
        <div className="flex flex-row gap-2 fixed right-2 bottom-14 items-end">
          {files
            ? Array.from(files).map(file => {
                const { type } = file;

                if (type.startsWith('image/')) {
                  return (
                    <div key={file.name}>
                      <img
                        className="w-24 rounded-md"
                        src={URL.createObjectURL(file)}
                        alt="image"
                      />
                      <span className="text-sm text-zinc-500">{file.name}</span>
                    </div>
                  );
                } else if (type.startsWith('text/')) {
                  return (
                    <div
                      key={file.name}
                      className="w-24 text-zinc-500 flex-shrink-0 text-sm flex flex-col gap-1"
                    >
                      <div className="w-16 h-20 bg-zinc-100 rounded-md" />
                      {file.name}
                    </div>
                  );
                }
              })
            : ''}
        </div>
        <input
          type="file"
          onChange={event => {
            if (event.target.files) {
              setFiles(event.target.files);
            }
          }}
          multiple
          ref={fileInputRef}
        />
        <input
          value={input}
          placeholder="Send message..."
          onChange={handleInputChange}
          className="bg-zinc-100 w-full p-2"
          disabled={isLoading}
        />
      </form>
    </div>
  );
}
