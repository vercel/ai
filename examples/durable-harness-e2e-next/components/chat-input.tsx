import {
  convertFileListToFileUIParts,
  type FileUIPart,
  type TextUIPart,
} from 'ai';
import { useRef, useState, type ChangeEvent } from 'react';

export default function ChatInput({
  status,
  onSubmit,
  onQueue,
  onSteer,
  cancel,
  maxWidth = 'md',
}: {
  status: string;
  onSubmit: (parts: Array<TextUIPart | FileUIPart>) => void;
  onQueue?: (parts: Array<TextUIPart | FileUIPart>) => Promise<void> | void;
  onSteer?: (parts: Array<TextUIPart | FileUIPart>) => void;
  cancel?: () => void;
  maxWidth?: string;
}) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<FileUIPart>();
  const [imageError, setImageError] = useState<string>();
  const [isReadingImage, setIsReadingImage] = useState(false);
  const [isQueueing, setIsQueueing] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const isTurnRunning = status === 'streaming' || status === 'submitted';
  const isInputEnabled =
    (status === 'ready' || isTurnRunning) && !isReadingImage && !isQueueing;

  async function handleImageSelect(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const files = input.files;
    const file = files?.[0];

    if (files == null || file == null) return;

    if (!file.type.startsWith('image/')) {
      setImageError('Choose an image file.');
      input.value = '';
      return;
    }

    setImageError(undefined);
    setIsReadingImage(true);

    try {
      const [fileUIPart] = await convertFileListToFileUIParts(files);
      setImage(fileUIPart);
    } catch {
      setImageError('Could not read this image. Please choose another file.');
    } finally {
      input.value = '';
      setIsReadingImage(false);
    }
  }

  function clearImage() {
    setImage(undefined);
    setImageError(undefined);
    if (imageInputRef.current != null) {
      imageInputRef.current.value = '';
    }
  }

  function buildParts(): Array<TextUIPart | FileUIPart> | undefined {
    if (!isInputEnabled || text.trim() === '') return undefined;
    const parts: Array<TextUIPart | FileUIPart> = [{ type: 'text', text }];
    if (image != null) parts.push(image);
    return parts;
  }

  return (
    <form
      className={`fixed bottom-0 z-10 w-full max-w-${maxWidth} p-2 mb-8 bg-white rounded border border-gray-300 shadow-xl`}
      onSubmit={event => {
        event.preventDefault();
        const parts = buildParts();
        if (parts == null) return;

        if (isTurnRunning) {
          if (onQueue == null) return;
          setText('');
          clearImage();
          setIsQueueing(true);
          void Promise.resolve(onQueue(parts)).finally(() => {
            setIsQueueing(false);
          });
          return;
        }
        onSubmit(parts);
        setText('');
        clearImage();
      }}
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        aria-label="Choose an image"
        disabled={!isInputEnabled}
        onChange={handleImageSelect}
      />

      {image != null && (
        <div className="flex items-center gap-2 mb-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={image.url}
            alt={image.filename ?? 'Selected image'}
            className="w-16 h-16 object-cover rounded"
          />
          <span className="min-w-0 text-xs text-gray-600 truncate">
            {image.filename ?? 'Selected image'}
          </span>
          <button
            type="button"
            className="px-2 py-1 text-sm underline"
            disabled={!isInputEnabled}
            onClick={clearImage}
          >
            Remove image
          </button>
        </div>
      )}

      {imageError != null && (
        <p role="alert" className="mb-2 text-sm text-red-600">
          {imageError}
        </p>
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="px-3 py-2 text-sm border border-gray-300 rounded"
          disabled={!isInputEnabled}
          onClick={() => imageInputRef.current?.click()}
        >
          Upload image
        </button>
        <input
          className="min-w-0 flex-1 p-2 border border-gray-300 rounded"
          placeholder="Say something..."
          disabled={!isInputEnabled}
          value={text}
          onChange={event => setText(event.target.value)}
        />
        {isTurnRunning && onQueue && (
          <button
            className="px-3 py-2 text-sm border border-gray-300 rounded disabled:opacity-50"
            type="submit"
            data-queueing={isQueueing ? 'true' : undefined}
            disabled={!isInputEnabled || text.trim() === ''}
          >
            Queue
          </button>
        )}
        {isTurnRunning && onSteer && (
          <button
            className="px-3 py-2 text-sm border border-gray-300 rounded disabled:opacity-50"
            type="button"
            disabled={!isInputEnabled}
            onClick={() => {
              const parts = buildParts() ?? [];
              onSteer(parts);
            }}
          >
            Steer
          </button>
        )}
        {cancel && isTurnRunning && (
          <button
            className="px-3 py-2 text-sm border border-gray-300 rounded"
            type="button"
            onClick={cancel}
          >
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}
