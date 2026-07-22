import ChatIdProvider from '@/components/chat-id-provider';
import PiHarnessChat from '@/components/pi-harness-chat';

export const metadata = {
  title: 'Pi — Workflow (Stepped)',
};

const STORAGE_KEY = 'harness-pi-workflow-stepped-chat-id';

export default function HarnessWorkflowSteppedPage() {
  return (
    <ChatIdProvider storageKey={STORAGE_KEY}>
      <PiHarnessChat
        apiRoute="/api/harness/pi/workflow-stepped"
        exampleLabel="Workflow (Stepped)"
      />
    </ChatIdProvider>
  );
}
