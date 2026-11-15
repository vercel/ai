'use client';

import { IconBell } from '@vercel/geistdocs/assets/icons/icon-bell';
import { IconCheckCircleFill } from '@vercel/geistdocs/assets/icons/icon-check-circle-fill';
import { IconLocation } from '@vercel/geistdocs/assets/icons/icon-location';
import { IconSun } from '@vercel/geistdocs/assets/icons/icon-sun';
import type { ReactNode } from 'react';
import {
  AssistantBubble,
  PromptBar,
  Reveal,
  Shell,
  Spinner,
  StreamingText,
  UserBubble,
  useTimeline,
} from './preview-kit';
import { useInView, usePrefersReducedMotion } from './use-scene';

interface SceneProps {
  active: boolean;
  reduce: boolean;
}

const USE_CHAT_DELAYS = [500, 700];

function UseChatScene({ active, reduce }: SceneProps) {
  const step = useTimeline(USE_CHAT_DELAYS, { active, reduce });
  return (
    <Shell label="Live preview of a chat interface built with useChat">
      <div className="flex flex-1 flex-col justify-center gap-3">
        <Reveal show={step >= 1}>
          <UserBubble>How does streaming work?</UserBubble>
        </Reveal>
        <Reveal show={step >= 2}>
          <AssistantBubble className="lg:w-[75%]">
            <StreamingText
              play={step >= 2}
              reduce={reduce}
              text="Tokens arrive incrementally, so the interface updates in real time as the model responds."
            />
          </AssistantBubble>
        </Reveal>
      </div>
      <PromptBar value="Ask a question…" />
    </Shell>
  );
}

const USE_COMPLETION_DELAYS = [600];

function UseCompletionScene({ active, reduce }: SceneProps) {
  const step = useTimeline(USE_COMPLETION_DELAYS, { active, reduce });
  return (
    <Shell label="Live preview of a text completion built with useCompletion">
      <div className="flex flex-1 flex-col justify-center gap-4">
        <div className="flex flex-col gap-2">
          <span className="text-label-12 font-medium text-gray-700">
            Prompt
          </span>
          <PromptBar value="Write a tagline for a coffee shop" />
        </div>
        <Reveal show={step >= 1}>
          <div className="flex flex-col gap-2">
            <span className="text-label-12 font-medium text-gray-700">
              Completion
            </span>
            <div className="material-small w-full px-3 py-2.5 text-label-12 text-gray-1000 lg:w-[30%]">
              <StreamingText
                play={step >= 1}
                reduce={reduce}
                text="Where every cup tells a story."
              />
            </div>
          </div>
        </Reveal>
      </div>
    </Shell>
  );
}

const NOTIFICATIONS = [
  { name: 'Study Group', message: 'Finals week session moved to 6:00 PM.' },
  { name: 'Library', message: 'Extended hours all weekend before exams.' },
];

function NotificationCard({
  name,
  message,
  showMessage,
  reduce,
}: {
  name: string;
  message: string;
  showMessage: boolean;
  reduce: boolean;
}) {
  return (
    <div className="material-small flex items-start gap-2.5 px-3 py-2.5">
      <span className="mt-0.5 flex size-6 items-center justify-center rounded-full bg-gray-100 text-gray-1000 [&_svg]:size-3">
        <IconBell aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-label-12 font-medium text-gray-1000">{name}</span>
        <span className="min-h-[1rem] text-label-12 text-gray-900">
          <StreamingText play={showMessage} reduce={reduce} text={message} />
        </span>
      </div>
    </div>
  );
}

const USE_OBJECT_DELAYS = [450, 1350, 800, 1350];

function UseObjectScene({ active, reduce }: SceneProps) {
  const step = useTimeline(USE_OBJECT_DELAYS, { active, reduce });
  return (
    <Shell label="Live preview of a structured object streaming in with useObject">
      <div className="flex items-center gap-1.5 text-gray-700">
        <span className="text-label-12 font-medium">Notifications</span>
        {step > 0 && step < USE_OBJECT_DELAYS.length && !reduce ? (
          <Spinner label="Streaming" />
        ) : null}
      </div>
      <div className="flex w-full flex-col justify-center gap-2.5 lg:w-1/2">
        <Reveal show={step >= 1}>
          <NotificationCard
            message={NOTIFICATIONS[0].message}
            name={NOTIFICATIONS[0].name}
            reduce={reduce}
            showMessage={step >= 2}
          />
        </Reveal>
        <Reveal show={step >= 3}>
          <NotificationCard
            message={NOTIFICATIONS[1].message}
            name={NOTIFICATIONS[1].name}
            reduce={reduce}
            showMessage={step >= 4}
          />
        </Reveal>
      </div>
    </Shell>
  );
}

function ToolChip({ resolved }: { resolved: boolean }) {
  return (
    <div className="inline-flex items-center gap-2 font-mono text-[11px]">
      <span className="flex items-center gap-1.5 text-gray-900 [&_svg]:size-3">
        <IconLocation aria-hidden="true" />
        getLocation
      </span>
      <span className="text-gray-500">→</span>
      {resolved ? (
        <span className="flex items-center gap-1 text-gray-900 [&_svg]:size-3">
          <IconCheckCircleFill aria-hidden="true" />
          San Francisco
        </span>
      ) : (
        <span className="flex items-center gap-1.5 text-gray-900">
          <Spinner label="Calling tool" />
          Locating…
        </span>
      )}
    </div>
  );
}

const CHAT_TOOLS_DELAYS = [500, 650, 1100, 500];

function ChatToolsScene({ active, reduce }: SceneProps) {
  const step = useTimeline(CHAT_TOOLS_DELAYS, { active, reduce });
  return (
    <Shell label="Live preview of a chat calling a tool built with useChat and tools">
      <div className="flex flex-1 flex-col justify-center gap-3">
        <Reveal show={step >= 1}>
          <UserBubble>What&apos;s the weather near me?</UserBubble>
        </Reveal>
        <Reveal show={step >= 2}>
          <ToolChip resolved={step >= 3} />
        </Reveal>
        <Reveal show={step >= 4}>
          <AssistantBubble>
            <StreamingText
              play={step >= 4}
              reduce={reduce}
              text="It's 72°F and sunny in San Francisco."
            />
          </AssistantBubble>
        </Reveal>
      </div>
      <PromptBar value="Ask a question…" />
    </Shell>
  );
}

function WeatherCard() {
  return (
    <div className="flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-gray-alpha-200 bg-background-200 px-3.5 py-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-label-12 text-gray-800">San Francisco</span>
        <span className="text-heading-24 font-semibold text-gray-1000">
          72°F
        </span>
        <span className="text-label-12 text-gray-900">Sunny</span>
      </div>
      <IconSun aria-hidden="true" className="text-amber-800" size={24} />
    </div>
  );
}

const GENERATIVE_UI_DELAYS = [500, 700, 1000];

function GenerativeUiScene({ active, reduce }: SceneProps) {
  const step = useTimeline(GENERATIVE_UI_DELAYS, { active, reduce });
  return (
    <Shell label="Live preview of a chat rendering a React component built with generative UI">
      <div className="flex flex-1 flex-col justify-center gap-3">
        <Reveal show={step >= 1}>
          <UserBubble>What&apos;s the weather in San Francisco?</UserBubble>
        </Reveal>
        <Reveal show={step >= 2}>
          <AssistantBubble>
            <StreamingText
              play={step >= 2}
              reduce={reduce}
              text="Here's the current weather:"
            />
          </AssistantBubble>
        </Reveal>
        <Reveal show={step >= 3}>
          <div className="ml-[2.375rem] w-fit">
            <WeatherCard />
          </div>
        </Reveal>
      </div>
      <PromptBar value="Ask a question…" />
    </Shell>
  );
}

const SCENES: Record<string, (props: SceneProps) => ReactNode> = {
  'use-chat': UseChatScene,
  'use-completion': UseCompletionScene,
  'use-object': UseObjectScene,
  'chat-tools': ChatToolsScene,
  'generative-ui': GenerativeUiScene,
};

export function UiPreview({ previewId }: { previewId: string }) {
  const { ref, inView } = useInView<HTMLDivElement>(0.35);
  const reduce = usePrefersReducedMotion();
  const Scene = SCENES[previewId];

  return (
    <div ref={ref}>
      {Scene ? <Scene active={inView} key={previewId} reduce={reduce} /> : null}
    </div>
  );
}
