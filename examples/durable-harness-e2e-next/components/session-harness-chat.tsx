'use client';

import { useChatId } from '@/components/chat-id-provider';
import FxHarnessChat from '@/components/fx/fx-harness-chat';
import PiHarnessChat from '@/components/pi/pi-harness-chat';

/**
 * Chat for the harness the current browser tab's session runs on.
 */
export default function SessionHarnessChat({
  exampleLabel,
}: {
  exampleLabel: string;
}) {
  const { harness } = useChatId();
  switch (harness) {
    case 'pi':
      return <PiHarnessChat exampleLabel={exampleLabel} />;
    case 'fx':
      return <FxHarnessChat exampleLabel={exampleLabel} />;
  }
}
