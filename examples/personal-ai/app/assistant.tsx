'use client';

import { useChat } from '@ai-sdk/react';
import { safeParseJSON } from '@ai-sdk/provider-utils';
import { DefaultChatTransport, type UIMessage } from 'ai';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  type AssistantMode,
  type ProviderId,
  providers,
} from '@/lib/providers';

type ProviderStatus = Record<
  ProviderId,
  { configured: boolean; keyName: string; name: string }
>;

type TaskPlan = {
  id: string;
  title: string;
  tasks: string[];
};

function isTaskPlan(value: unknown): value is TaskPlan {
  if (typeof value !== 'object' || value === null) return false;
  const plan = value as { id?: unknown; title?: unknown; tasks?: unknown };
  return (
    typeof plan.id === 'string' &&
    typeof plan.title === 'string' &&
    Array.isArray(plan.tasks) &&
    plan.tasks.every(task => typeof task === 'string')
  );
}

function isStoredMessages(value: unknown): value is UIMessage[] {
  return (
    Array.isArray(value) &&
    value.every(
      message =>
        typeof message?.id === 'string' &&
        (message.role === 'user' || message.role === 'assistant') &&
        Array.isArray(message.parts),
    )
  );
}

const CHAT_STORAGE_KEY = 'personal-ai.chat.v1';
const PLANS_STORAGE_KEY = 'personal-ai.plans.v1';
const COMPLETED_STORAGE_KEY = 'personal-ai.completed.v1';

const starters = [
  'Help me understand a tricky concept',
  'Review this code and suggest improvements',
  'Plan a focused week of work',
];

function readTaskPlan(part: unknown, messageId: string): TaskPlan | undefined {
  if (typeof part !== 'object' || part === null) return;
  const value = part as {
    type?: unknown;
    state?: unknown;
    toolCallId?: unknown;
    output?: unknown;
  };
  if (
    value.type !== 'tool-createTaskPlan' ||
    value.state !== 'output-available' ||
    typeof value.output !== 'object' ||
    value.output === null
  ) {
    return;
  }
  const output = value.output as { title?: unknown; tasks?: unknown };
  if (
    typeof output.title !== 'string' ||
    !Array.isArray(output.tasks) ||
    !output.tasks.every(task => typeof task === 'string')
  ) {
    return;
  }
  return {
    id:
      typeof value.toolCallId === 'string'
        ? value.toolCallId
        : `${messageId}-${output.title}`,
    title: output.title,
    tasks: output.tasks,
  };
}

export default function Assistant() {
  const [provider, setProvider] = useState<ProviderId>('openai');
  const [mode, setMode] = useState<AssistantMode>('chat');
  const [input, setInput] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [providerStatus, setProviderStatus] = useState<ProviderStatus>();
  const [configurationError, setConfigurationError] = useState<string>();
  const [requestErrorMessage, setRequestErrorMessage] = useState<string>();
  const [plans, setPlans] = useState<TaskPlan[]>([]);
  const [completed, setCompleted] = useState<string[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const selectedModel = providers[provider].models[0];
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        prepareSendMessagesRequest: ({ messages }) => ({
          body: {
            messages,
            provider,
            model: selectedModel.id,
            mode,
          },
        }),
      }),
    [mode, provider, selectedModel.id],
  );
  const { messages, sendMessage, status, error, stop, setMessages } = useChat({
    transport,
  });
  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    let active = true;
    if (!error) {
      setRequestErrorMessage(undefined);
      return;
    }

    const resolveErrorMessage = async () => {
      const parsed = await safeParseJSON({ text: error.message });
      if (!active) return;
      if (
        parsed.success &&
        typeof parsed.value === 'object' &&
        parsed.value !== null &&
        'error' in parsed.value &&
        typeof parsed.value.error === 'string'
      ) {
        setRequestErrorMessage(parsed.value.error);
      } else {
        setRequestErrorMessage(error.message);
      }
    };
    void resolveErrorMessage();

    return () => {
      active = false;
    };
  }, [error]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      try {
        const savedMessages = localStorage.getItem(CHAT_STORAGE_KEY);
        if (savedMessages) {
          const parsed = await safeParseJSON({ text: savedMessages });
          if (parsed.success && isStoredMessages(parsed.value)) {
            setMessages(parsed.value);
          }
        }

        const savedPlans = localStorage.getItem(PLANS_STORAGE_KEY);
        if (savedPlans) {
          const parsed = await safeParseJSON({ text: savedPlans });
          if (
            parsed.success &&
            Array.isArray(parsed.value) &&
            parsed.value.every(isTaskPlan) &&
            active
          ) {
            setPlans(parsed.value);
          }
        }

        const savedCompleted = localStorage.getItem(COMPLETED_STORAGE_KEY);
        if (savedCompleted) {
          const parsed = await safeParseJSON({ text: savedCompleted });
          if (
            parsed.success &&
            Array.isArray(parsed.value) &&
            parsed.value.every(item => typeof item === 'string') &&
            active
          ) {
            setCompleted(parsed.value);
          }
        }
      } catch (storageError) {
        console.error('Could not restore saved assistant data.', storageError);
      } finally {
        if (active) setHydrated(true);
      }
    };
    void restore();

    fetch('/api/config')
      .then(async response => {
        if (!response.ok) throw new Error('Could not load provider settings.');
        const data = await response.json();
        if (active) setProviderStatus(data.providers);
      })
      .catch(configError => {
        console.error('Could not load provider settings.', configError);
      });
    return () => {
      active = false;
    };
  }, [setMessages]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages));
  }, [hydrated, messages]);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify(plans));
    localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(completed));
  }, [completed, hydrated, plans]);

  useEffect(() => {
    const newPlans = messages.flatMap(message =>
      message.parts
        .map(part => readTaskPlan(part, message.id))
        .filter((plan): plan is TaskPlan => plan !== undefined),
    );
    if (newPlans.length === 0) return;
    setPlans(current => {
      const byId = new Map(current.map(plan => [plan.id, plan]));
      for (const plan of newPlans) byId.set(plan.id, plan);
      return [...byId.values()];
    });
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, plans]);

  const submit = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || busy) return;
      const selectedProviderStatus = providerStatus?.[provider];
      if (selectedProviderStatus && !selectedProviderStatus.configured) {
        setConfigurationError(
          `Add ${selectedProviderStatus.keyName} to examples/personal-ai/.env.local, then restart the app.`,
        );
        setSettingsOpen(true);
        return;
      }
      setConfigurationError(undefined);
      sendMessage({ text: trimmed });
      setInput('');
    },
    [busy, provider, providerStatus, sendMessage],
  );

  const clearChat = () => {
    setMessages([]);
    localStorage.removeItem(CHAT_STORAGE_KEY);
  };

  const toggleTask = (id: string) => {
    setCompleted(current => {
      const next = current.includes(id)
        ? current.filter(item => item !== id)
        : [...current, id];
      localStorage.setItem(COMPLETED_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const modeDescriptions: Record<AssistantMode, string> = {
    chat: 'Ask anything or work through a coding problem.',
    research: 'Search the live web and get a sourced summary.',
    tasks: 'Turn a goal into a checklist you can track here.',
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <Link className="brand" href="/" aria-label="Personal AI home">
          <span className="brand-mark">✳</span>
          <span>
            personal<span className="brand-light">.ai</span>
          </span>
        </Link>
        <button className="new-chat" onClick={clearChat} type="button">
          <span aria-hidden="true">＋</span> New conversation
        </button>
        <div className="side-label">YOUR SPACE</div>
        <div className="side-link active">
          <span>◉</span> Assistant
        </div>
        <div className="side-link">
          <span>✓</span> Task plans{' '}
          <span className="count">{plans.length || ''}</span>
        </div>
        <div className="sidebar-bottom">
          <div className="privacy-card">
            <span className="privacy-icon">◈</span>
            <strong>Your keys stay yours</strong>
            <p>Provider keys live in your local server environment.</p>
            <button type="button" onClick={() => setSettingsOpen(true)}>
              Manage providers <span aria-hidden="true">↗</span>
            </button>
          </div>
          <div className="local-indicator">
            <span /> Running on your machine
          </div>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="crumb-slash">/</span>
            <strong>Assistant</strong>
          </div>
          <div className="topbar-actions">
            <label className="select-wrap" aria-label="AI provider">
              <span className={`provider-dot ${provider}`} />
              <select
                value={provider}
                onChange={event => {
                  setProvider(event.target.value as ProviderId);
                  setConfigurationError(undefined);
                }}
              >
                {Object.entries(providers).map(([id, option]) => (
                  <option key={id} value={id}>
                    {option.name}
                  </option>
                ))}
              </select>
              <span className="chevron">⌄</span>
            </label>
            <button
              className="settings-button"
              onClick={() => setSettingsOpen(true)}
              type="button"
              aria-label="Provider settings"
              title="Provider settings"
            >
              ⚙
            </button>
          </div>
        </header>

        <div className="mode-tabs" role="tablist" aria-label="Assistant mode">
          {(
            [
              ['chat', '✳', 'Chat'],
              ['research', '⌕', 'Research'],
              ['tasks', '☷', 'Tasks'],
            ] as const
          ).map(([id, icon, label]) => (
            <button
              aria-selected={mode === id}
              className={`mode-tab ${mode === id ? 'selected' : ''}`}
              key={id}
              onClick={() => setMode(id)}
              role="tab"
              type="button"
            >
              <span>{icon}</span>
              {label}
              {id === 'research' && <span className="live-dot" />}
            </button>
          ))}
          <div className="model-label">{selectedModel.name}</div>
        </div>

        <div className="conversation">
          <div className="conversation-inner">
            {messages.length === 0 ? (
              <section className="welcome">
                <div className="welcome-orbit">
                  <span>✳</span>
                </div>
                <div className="eyebrow">
                  <span className="live-dot" /> YOUR PERSONAL AI
                </div>
                <h1>
                  A little more
                  <br />
                  <span>thoughtful.</span>
                </h1>
                <p className="welcome-copy">{modeDescriptions[mode]}</p>
                <div className="starter-grid">
                  {starters.map((starter, index) => (
                    <button
                      className="starter"
                      key={starter}
                      onClick={() => submit(starter)}
                      type="button"
                    >
                      <span className={`starter-icon starter-${index}`}>
                        {['✳', '</>', '↗'][index]}
                      </span>
                      <span>{starter}</span>
                      <span className="starter-arrow">↗</span>
                    </button>
                  ))}
                </div>
                <div className="welcome-note">
                  Private by default <span>·</span> Your conversations stay in
                  this browser
                </div>
              </section>
            ) : (
              <section className="messages">
                {messages.map(message => (
                  <article
                    className={`message ${message.role}`}
                    key={message.id}
                  >
                    <div className="avatar">
                      {message.role === 'user' ? 'Y' : '✳'}
                    </div>
                    <div className="message-content">
                      <div className="message-label">
                        {message.role === 'user' ? 'You' : 'Personal AI'}
                      </div>
                      {message.parts.map((part, index) => {
                        if (part.type === 'text') {
                          return (
                            <p
                              className="message-text"
                              key={`${message.id}-${index}`}
                            >
                              {part.text}
                            </p>
                          );
                        }
                        if (part.type === 'source-url') {
                          return (
                            <a
                              className="source-link"
                              href={part.url}
                              key={`${message.id}-${index}`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              <span>↗</span>{' '}
                              {part.title || new URL(part.url).hostname}
                            </a>
                          );
                        }
                        return null;
                      })}
                      {message.role === 'assistant' &&
                        message.parts.some(
                          part => part.type === 'tool-createTaskPlan',
                        ) && (
                          <span className="tool-note">
                            Checklist saved below
                          </span>
                        )}
                    </div>
                  </article>
                ))}
                {busy && (
                  <div className="thinking">
                    <span className="assistant-mini">✳</span>
                    <span className="typing">
                      <i />
                      <i />
                      <i />
                    </span>
                    <span>
                      {mode === 'research' ? 'Searching sources' : 'Thinking'}
                    </span>
                  </div>
                )}
                {(error || configurationError) && (
                  <div className="error-card">
                    <strong>
                      {configurationError ||
                      requestErrorMessage?.includes('API_KEY')
                        ? 'Provider setup needed'
                        : 'That didn’t work.'}
                    </strong>
                    <p>{configurationError || requestErrorMessage}</p>
                    <span>
                      Add a valid provider key in settings, then try again.
                    </span>
                  </div>
                )}
              </section>
            )}

            {mode === 'tasks' && plans.length > 0 && (
              <section className="task-plans">
                <div className="task-plans-heading">
                  <span>☷</span>
                  <div>
                    <h2>Your task plans</h2>
                    <p>Saved in this browser · check off items as you go</p>
                  </div>
                </div>
                {plans.map(plan => (
                  <div className="task-plan" key={plan.id}>
                    <h3>{plan.title}</h3>
                    <div className="task-list">
                      {plan.tasks.map((task, index) => {
                        const taskId = `${plan.id}:${index}`;
                        const isDone = completed.includes(taskId);
                        return (
                          <label
                            className={`task-item ${isDone ? 'done' : ''}`}
                            key={taskId}
                          >
                            <input
                              checked={isDone}
                              onChange={() => toggleTask(taskId)}
                              type="checkbox"
                            />
                            <span className="custom-check" />
                            <span>{task}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            )}
            <div ref={bottomRef} />
          </div>
        </div>

        <footer className="composer-wrap">
          <form
            className="composer"
            onSubmit={event => {
              event.preventDefault();
              submit(input);
            }}
          >
            <textarea
              aria-label="Message"
              onChange={event => setInput(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  submit(input);
                }
              }}
              placeholder={
                mode === 'research'
                  ? 'What would you like to research?'
                  : mode === 'tasks'
                    ? 'What would you like to get done?'
                    : 'Ask anything, or paste your code...'
              }
              rows={1}
              value={input}
            />
            {busy ? (
              <button
                className="send-button stop-button"
                onClick={stop}
                title="Stop response"
                type="button"
              >
                ■
              </button>
            ) : (
              <button
                className="send-button"
                disabled={!input.trim()}
                title="Send message"
                type="submit"
              >
                ↑
              </button>
            )}
          </form>
          <div className="composer-meta">
            <span>
              {providers[provider].name} · {selectedModel.name}
            </span>
            <span>
              Enter to send <kbd>↵</kbd>
            </span>
          </div>
          {mode === 'tasks' && (
            <p className="capability-note">
              Plans are saved locally; this app does not execute tasks on your
              computer.
            </p>
          )}
        </footer>
      </section>

      {settingsOpen && (
        <div
          className="modal-backdrop"
          onMouseDown={event => {
            if (event.target === event.currentTarget) setSettingsOpen(false);
          }}
        >
          <section
            aria-labelledby="settings-title"
            aria-modal="true"
            className="settings-modal"
            role="dialog"
          >
            <button
              className="modal-close"
              onClick={() => setSettingsOpen(false)}
              type="button"
              aria-label="Close settings"
            >
              ×
            </button>
            <div className="modal-icon">⚙</div>
            <div className="eyebrow">LOCAL CONFIGURATION</div>
            <h2 id="settings-title">Connect your providers</h2>
            <p className="modal-copy">
              API keys stay on your machine and are sent only to the provider
              you select.
            </p>
            <div className="provider-list">
              {Object.entries(providers).map(([id, item]) => {
                const connected =
                  providerStatus?.[id as ProviderId]?.configured;
                return (
                  <button
                    className={`provider-row ${provider === id ? 'current' : ''}`}
                    key={id}
                    onClick={() => setProvider(id as ProviderId)}
                    type="button"
                  >
                    <span className={`provider-dot ${id}`} />
                    <span className="provider-details">
                      <strong>{item.name}</strong>
                      <code>{item.keyName}</code>
                    </span>
                    <span
                      className={`connection-status ${connected ? 'connected' : ''}`}
                    >
                      <i />
                      {providerStatus
                        ? connected
                          ? 'Ready'
                          : 'Add key'
                        : 'Checking'}
                    </span>
                  </button>
                );
              })}
            </div>
            <div className="setup-instructions">
              <div>
                <span>01</span> Create{' '}
                <code>examples/personal-ai/.env.local</code>
              </div>
              <div>
                <span>02</span> Add the matching key from your provider
                dashboard
              </div>
              <div>
                <span>03</span> Restart the dev server to connect
              </div>
            </div>
            <p className="key-safety">
              Never paste keys into chat. Do not commit <code>.env.local</code>.
            </p>
          </section>
        </div>
      )}
    </main>
  );
}
