"use client";
import {MessageUI, MessageUIPart} from "@/app/types";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  Message,
  MessageAvatar,
  MessageContent,
} from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputMessage,
  PromptInputModelSelect,
  PromptInputModelSelectContent,
  PromptInputModelSelectItem,
  PromptInputModelSelectTrigger,
  PromptInputModelSelectValue,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {Reasoning} from "@/components/ai-elements/reasoning";
import {Response} from "@/components/ai-elements/response";
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
} from "@/components/ai-elements/tool";
import {useChat} from "@ai-sdk/react";
import {DefaultChatTransport} from "ai";
import {BrainIcon, GlobeIcon} from "lucide-react";
import {useState, useMemo, useRef, useEffect} from "react";

function Page() {
  const [input, setInput] = useState("");
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [useReasoning, setUseReasoning] = useState(false);
  const [model, setModel] = useState("gpt-5-nano");

  const modelRef = useRef(model);
  const searchRef = useRef(useWebSearch);
  const reasoningRef = useRef(useReasoning);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  useEffect(() => {
    searchRef.current = useWebSearch;
  }, [useWebSearch]);

  useEffect(() => {
    reasoningRef.current = useReasoning;
  }, [useReasoning]);

  const models = [
    {id: "gpt-5-nano", name: "GPT-5 Nano"},
    {id: "gpt-4o", name: "GPT-4o"},
    {id: "gpt-4", name: "GPT-4"},
    {id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo"},
  ];

  const transport = useMemo(
    () =>
      // eslint-disable-next-line react-hooks/refs
      new DefaultChatTransport({
        api: "http://localhost:8000/api/chat",
        headers: {
          "Content-Type": "application/json",
        },
        prepareSendMessagesRequest: (requestOptions) => {
          const {messages, trigger, messageId} = requestOptions;
          return {
            body: {
              model: modelRef.current,
              messages: messages,
              search: searchRef.current,
              reasoning: reasoningRef.current,
              trigger,
              messageId,
            },
          };
        },
      }),
    []
  );

  const {messages, sendMessage, status} = useChat<MessageUI>({
    transport,
  });

  async function handleSubmit(message: PromptInputMessage) {
    const textToSend = message.text || input;
    if (!textToSend.trim()) return;

    const parts: MessageUIPart[] = [{type: "text", text: textToSend}];

    if (message.files?.length) {
      message.files.forEach((attachment) => {
        parts.push({
          type: "file",
          filename: attachment.filename,
          mediaType: attachment.mediaType,
          url: attachment.url,
        });
      });
    }

    try {
      await sendMessage({
        role: "user",
        parts,
      });
      setInput("");
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  }

  return (
    <div className="relative flex size-full h-screen flex-col divide-y p-5 overflow-hidden">
      <Conversation className="min-h-[100vh-15rem] h-full p-5 border">
        <ConversationContent>
          {messages.map((message) => (
            <Message from={message.role} key={message.id}>
              <MessageContent>
                <MessageParts message={message} />
              </MessageContent>
              <MessageAvatar
                name={message.role === "user" ? "U" : "A"}
                src={
                  message.role === "user"
                    ? "/avatars/user.png"
                    : "/avatars/assistant.png"
                }
              />
            </Message>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="grid shrink-0 gap-4 pt-4">
        <div className="w-full px-4 pb-4">
          <PromptInput globalDrop multiple onSubmit={handleSubmit}>
            <PromptInputHeader>
              <PromptInputAttachments>
                {(attachment) => <PromptInputAttachment data={attachment} />}
              </PromptInputAttachments>
            </PromptInputHeader>
            <PromptInputBody>
              <PromptInputTextarea
                onChange={(event) => setInput(event.target.value)}
                value={input}
              />
            </PromptInputBody>
            <PromptInputFooter>
              <PromptInputTools>
                <PromptInputActionMenu>
                  <PromptInputActionMenuTrigger />
                  <PromptInputActionMenuContent>
                    <PromptInputActionAddAttachments />
                  </PromptInputActionMenuContent>
                </PromptInputActionMenu>
                <PromptInputButton
                  onClick={() => setUseWebSearch(!useWebSearch)}
                  variant={useWebSearch ? "default" : "ghost"}
                >
                  <GlobeIcon size={16} />
                  <span>Search</span>
                </PromptInputButton>
                <PromptInputButton
                  onClick={() => setUseReasoning(!useReasoning)}
                  variant={useReasoning ? "default" : "ghost"}
                >
                  <BrainIcon size={16} />
                  <span>Reasoning</span>
                </PromptInputButton>
                <PromptInputModelSelect onValueChange={setModel} value={model}>
                  <PromptInputModelSelectTrigger>
                    <PromptInputModelSelectValue />
                  </PromptInputModelSelectTrigger>
                  <PromptInputModelSelectContent>
                    {models.map((model) => (
                      <PromptInputModelSelectItem
                        key={model.id}
                        value={model.id}
                      >
                        {model.name}
                      </PromptInputModelSelectItem>
                    ))}
                  </PromptInputModelSelectContent>
                </PromptInputModelSelect>
              </PromptInputTools>
              <PromptInputSubmit
                disabled={!(input.trim() || status) || status === "streaming"}
                status={status}
              />
            </PromptInputFooter>
          </PromptInput>
        </div>
      </div>
    </div>
  );
}
export default Page;

function MessageParts({message}: {message: MessageUI}) {
  return (
    <>
      {message.parts.map((part, index) => {
        switch (part.type) {
          case "reasoning":
            return (
              <Reasoning key={index} isStreaming={part.state === "streaming"}>
                {part.text}
              </Reasoning>
            );
          case "text":
            return <Response key={index}>{part.text}</Response>;
          case "file":
            return (
              <div key={index} className="mt-2">
                <a
                  href={part.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  {part.filename}
                </a>
              </div>
            );
          case "tool-get_current_weather":
            return (
              <Tool defaultOpen key={index}>
                <ToolHeader
                  state="input-streaming"
                  title={part.title}
                  type={part.type}
                />
                <ToolContent>
                  <ToolInput input={part.input} />
                </ToolContent>
              </Tool>
            );
          case "data-citation":
            return (
              <div key={index} className="mt-2 italic text-sm text-gray-600">
                <strong>Citation:</strong> {part.data.description} (
                <a
                  href={part.data.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 underline"
                >
                  Link
                </a>
                )
              </div>
            );

          default:
            return null;
        }
      })}
    </>
  );
}
