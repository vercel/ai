/* eslint-disable @next/next/no-img-element */
import { useChat } from 'ai/react';

export default function Page() {
  const {
    messages,
    input,
    files,
    handleSubmit,
    handleInputChange,
    handleFileInputChange,
    fileInputRef,
    isLoading,
  } = useChat({
    api: '/api/stream-chat',
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-col p-2 gap-2">
        {messages.map(message => (
          <div key={message.id} className="flex flex-row gap-2">
            <div className="w-24 text-zinc-500 flex-shrink-0">{`${message.role}: `}</div>

            <div className="flex flex-col gap-2">
              {message.parts
                .filter(part => part.type === 'text')
                .map((part, index) => {
                  if (index === 0) {
                    return (
                      <div key={`${message.id}-${index}`} className="w-full">
                        {part.type === 'text' ? part.text : ''}
                      </div>
                    );
                  } else {
                    return (
                      <div
                        key={`${message.id}-${index}`}
                        className="w-32 text-xs border h-24 text-ellipsis overflow-hidden rounded-md p-2"
                      >
                        {part.type === 'text' ? part.text : ''}
                      </div>
                    );
                  }
                })}

              <div className="flex flex-row gap-2">
                {message.parts
                  .filter(part => part.type === 'image')
                  .map((part, index) => (
                    <img
                      key={`${message.id}-${index}`}
                      className="w-24 rounded-md"
                      src={`${part.type === 'image' ? part.image : ''}`}
                      alt="image"
                    />
                  ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 fixed bottom-0 p-2 w-full"
      >
        <div className="flex flex-row gap-2 fixed right-2 bottom-14 items-end">
          {Array.from(files).map(file => {
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
          })}
        </div>
        <input
          type="file"
          onChange={handleFileInputChange}
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
