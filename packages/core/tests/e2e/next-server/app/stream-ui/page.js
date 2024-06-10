import { action } from './action';
import { Client } from './client';

export default function Page() {
  return <Client action={action} />;
}
