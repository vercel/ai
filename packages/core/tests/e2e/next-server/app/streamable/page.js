import { streamableUI, streamableValue, streamableUIAppend } from './actions';
import { Client } from './client';

export default function Page() {
  return (
    <Client
      actions={{
        streamableUI,
        streamableValue,
        streamableUIAppend,
      }}
    />
  );
}
