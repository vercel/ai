/* eslint-disable @next/next/no-img-element */
import { useChat } from 'ai/react';
import { useRef, useState } from 'react';
import { upload } from '@vercel/blob/client';
import { URLFileList } from '../../../../../packages/ui-utils/dist';

export default function Page() {
  const { messages, input, handleSubmit, handleInputChange, isLoading } =
    useChat({
      api: '/api/stream-chat',
    });

  const [files, setFiles] = useState<URLFileList>([]);
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
                {message.files?.map((file, index) =>
                  file.type === 'url' ? (
                    <img
                      key={`${message.id}-${index}`}
                      className="w-24 rounded-md"
                      src={file.url}
                      alt="image"
                    />
                  ) : (
                    ''
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
          setFiles([]);

          if (fileInputRef.current) {
            fileInputRef.current.value = '';
          }
        }}
        className="flex flex-col gap-2 fixed bottom-0 p-2 w-full"
      >
        <div className="flex flex-row gap-2 fixed right-2 bottom-14 items-end">
          {Array.from(files).map(file => {
            const { type } = file;

            if (type && type.startsWith('image/')) {
              return (
                <div key={file.name}>
                  <img className="w-24 rounded-md" src={file.url} alt="image" />
                  <span className="text-sm text-zinc-500">{file.name}</span>
                </div>
              );
            }
          })}
        </div>
        <input
          type="file"
          onChange={async event => {
            if (event.target.files) {
              for (const file of Array.from(event.target.files)) {
                const blob = await upload(file.name, file, {
                  access: 'public',
                  handleUploadUrl: '/api/file',
                });

                setFiles(prevFiles => [
                  ...prevFiles,
                  { name: file.name, type: blob.contentType, url: blob.url },
                ]);
              }
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
