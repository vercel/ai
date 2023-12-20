import { useState, useEffect } from 'react';
import { InkeepRecordsCitedData, OnFinalInkeepMetadata } from 'ai';

export interface EventHandlers {
  onFinalMetadata?: (data: OnFinalInkeepMetadata) => void;
  // onRecordsCited?: (data: InkeepRecordsCitedData) => void;
}

export function useHandleEvents(
  data: any[] | undefined,
  handlers: EventHandlers,
) {
  const [prevDataLength, setPrevDataLength] = useState(0);

  useEffect(() => {
    if (data && data.length > prevDataLength) {
      for (let i = prevDataLength; i < data.length; i++) {
        const item = data[i];
        if (item.onFinalMetadata && handlers.onFinalMetadata) {
          handlers.onFinalMetadata(item.onFinalMetadata);
        }
        // if (item.onRecordsCited && handlers.onRecordsCited) {
        //   handlers.onRecordsCited(item.onRecordsCited);
        // }
      }
      setPrevDataLength(data.length);
    }
  }, [data?.length, handlers]);
}

export default useHandleEvents;
