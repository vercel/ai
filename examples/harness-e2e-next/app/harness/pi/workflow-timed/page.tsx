import ChatIdProvider from '@/components/chat-id-provider';
import PiHarnessChat from '@/components/pi-harness-chat';

export const metadata = {
  title: 'Pi — Workflow (Timed)',
};

const STORAGE_KEY = 'harness-pi-workflow-timed-chat-id';

export default function HarnessPiWorkflowTimedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <PiHarnessChat
        apiRoute="/api/harness/pi/workflow-timed"
        exampleLabel="Workflow (Timed)"
      />
    </ChatIdProvider>
  );
}
