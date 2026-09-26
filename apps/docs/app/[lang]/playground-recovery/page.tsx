import type { Metadata } from 'next';
import { PlaygroundRecovery } from '@/components/playground/recovery';

export const metadata: Metadata = {
  title: 'Recover your playground settings',
  robots: { index: false, follow: false },
};

export default function PlaygroundRecoveryPage() {
  return <PlaygroundRecovery />;
}
