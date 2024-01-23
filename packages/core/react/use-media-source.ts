import { useCallback, useRef } from 'react';
import useSWR from 'swr';

// internal hook
export function useMediaSource({ id }: { id: string }) {
  const sourceBufferRef = useRef<SourceBuffer | undefined>(undefined);
  const audioChunks = useRef<ArrayBufferLike[]>([]);
  const { data: mediaSourceData } = useSWR<
    | {
        mediaSource: MediaSource;
        url: string;
      }
    | undefined
  >([id, 'mediaSource'], async () => {
    // MediaSource is not available on the server:
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaSource = new MediaSource();

    mediaSource.addEventListener(
      'sourceopen',
      () => {
        // audio/mpeg is returned by the supported speech stream providers
        sourceBufferRef.current = mediaSource.addSourceBuffer('audio/mpeg');

        sourceBufferRef.current.addEventListener('updateend', () => {
          tryAppendNextChunk();
        });
      },
      { once: true },
    );

    return {
      mediaSource,
      url: URL.createObjectURL(mediaSource),
    };
  });

  const tryAppendNextChunk = useCallback(() => {
    const sourceBuffer = sourceBufferRef.current;
    const chunks = audioChunks.current;

    if (sourceBuffer != null && !sourceBuffer.updating && chunks.length > 0) {
      // get first audio chunk and append it to the source buffer
      sourceBuffer.appendBuffer(chunks.shift()!);
    }
  }, []);

  return {
    mediaSourceUrl: mediaSourceData?.url ?? null,
    finishAudioStream() {
      if (mediaSourceData?.mediaSource.readyState === 'open') {
        mediaSourceData?.mediaSource.endOfStream();
      }
    },
    appendAudioChunk(base64Chunk: string) {
      audioChunks.current.push(
        Uint8Array.from(atob(base64Chunk), char => char.charCodeAt(0)).buffer,
      );

      tryAppendNextChunk();
    },
  };
}
