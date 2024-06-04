import { ReactNode } from 'react';
import { AI } from './actions';

export default function Layout({ children }: { children: ReactNode }) {
  return <AI>{children}</AI>;
}
