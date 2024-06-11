import {
  streamableUI,
  streamableValue,
  streamableUIAppend,
  streamableUIError,
} from './actions';
import { Client } from './client';

export default function Page() {
  return (
    <Client
      actions={{
        streamableUI,
        streamableValue,
        streamableUIAppend,
        streamableUIError,
      }}
    />
  );
}
