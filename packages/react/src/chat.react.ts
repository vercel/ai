import {
  AbstractChat,
  ChatState,
  ChatStatus,
  UIDataPartSchemas,
  UIDataTypes,
  UIMessage,
} from 'ai';
import { useRef } from 'react';

type SubscriptionRegistrars = {
  registerMessagesCallback: (onChange: () => void) => () => void;
  registerStatusCallback: (onChange: () => void) => () => void;
  registerErrorCallback: (onChange: () => void) => () => void;
};

// TODO: Throttle needs to be implemented in here
export function useChatState<MESSAGE_METADATA, DATA_TYPES extends UIDataTypes>(
  initialMessages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[] = [],
): ChatState<MESSAGE_METADATA, DATA_TYPES> & SubscriptionRegistrars {
  const messagesRef =
    useRef<UIMessage<MESSAGE_METADATA, DATA_TYPES>[]>(initialMessages);
  const messagesUpdatedRef = useRef<() => void>(() => void 0);
  const statusRef = useRef<ChatStatus>('ready');
  const statusUpdatedRef = useRef<() => void>(() => void 0);
  const errorRef = useRef<Error | undefined>(undefined);
  const errorUpdatedRef = useRef<() => void>(() => void 0);

  return {
    get status() {
      return statusRef.current;
    },
    set status(newStatus: ChatStatus) {
      statusRef.current = newStatus;
      statusUpdatedRef.current();
    },
    get error() {
      return errorRef.current;
    },
    set error(newError: Error | undefined) {
      errorRef.current = newError;
      errorUpdatedRef.current();
    },
    get messages() {
      return messagesRef.current;
    },
    set messages(newMessages: UIMessage<MESSAGE_METADATA, DATA_TYPES>[]) {
      messagesRef.current = [...newMessages];
      messagesUpdatedRef.current();
    },
    pushMessage: (message: UIMessage<MESSAGE_METADATA, DATA_TYPES>) => {
      messagesRef.current = messagesRef.current.concat(message);
      messagesUpdatedRef.current();
    },
    popMessage: () => {
      messagesRef.current = messagesRef.current.slice(0, -1);
      messagesUpdatedRef.current();
    },
    replaceMessage: (
      index: number,
      message: UIMessage<MESSAGE_METADATA, DATA_TYPES>,
    ) => {
      messagesRef.current = [
        ...messagesRef.current.slice(0, index),
        message,
        ...messagesRef.current.slice(index + 1),
      ];
      messagesUpdatedRef.current();
    },
    snapshot: <T>(value: T): T => structuredClone(value),
    registerMessagesCallback: (onChange: () => void) => {
      messagesUpdatedRef.current = onChange;
      return () => void 0;
    },
    registerStatusCallback: (onChange: () => void) => {
      statusUpdatedRef.current = onChange;
      return () => void 0;
    },
    registerErrorCallback: (onChange: () => void) => {
      errorUpdatedRef.current = onChange;
      return () => void 0;
    },
  };
}

export class Chat<
  MESSAGE_METADATA,
  UI_DATA_PART_SCHEMAS extends UIDataPartSchemas = UIDataPartSchemas,
> extends AbstractChat<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS> {
  constructor(
    init: ConstructorParameters<
      typeof AbstractChat<MESSAGE_METADATA, UI_DATA_PART_SCHEMAS>
    >[0],
  ) {
    super(init);
  }
}
