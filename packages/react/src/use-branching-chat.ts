import type {
  ChatRequestOptions,
  UIMessage,
  UUID,
  BranchMessage,
  BranchMessageCreate,
} from '@ai-sdk/ui-utils';

import { useCallback, useMemo, useState, useEffect, useRef } from 'react';
import useSWR from 'swr';

import {
  buildAdjacency,
  getConversationPath,
  getSiblingIdsSorted,
  findLatestLeafDescendant,
  generateId as generateIdFunc,
} from '@ai-sdk/ui-utils';
import { useChat } from './use-chat';

type UseBranchingChatOptions = Parameters<typeof useChat>[0] & {
  id?: UUID;
  initialMessages?: BranchMessage[];
  initialCurrentLeafId?: UUID;
  generateId?: () => UUID;
  onFinish?: (message: UIMessage) => void;
  /**
   * Called after an early `stop` call (to invoke the abort signal), but before
   * we finalize the partial response message in state, letting the caller
   * transform or replace the partial completion or perform side effects if needed.
   */
  onStop?: (partialMessage?: UIMessage) => Promise<void> | void;
};

/**
 * useBranchingChat manages a conversation tree with branching support.
 *
 * State maintained:
 *  - `fullTreeMessages`: the entire conversation (source-of-truth).
 *  - `currentLeafId`: the ID of the tip of the active branch.
 *
 * It derives the current branch (to display) by computing the unique path
 * from the root to currentLeafId.
 *
 * The hook wraps `useChat` so that streaming updates occur on the current branch.
 * When streaming is finished (`onFinish`), the new assistant message is merged into
 * `fullTreeMessages`, and `currentLeafId` is updated.
 *
 * The hook exposes the following API:
 *  - `messages`, `append`, `reload`, `stop`, `input`, `setInput`, etc. from `useChat`.
 *  - Some methods are overridden such as `handleSubmit`, which updates the full tree.
 *  - Some methods are extended like `onFinish`, which merges new assistant messages.
 *  - `fullTreeMessages` and helpers (`messagesById`, `childrenMap`).
 *  - `messagesById` is a mapping of UIMessage ID → message
 *  - `childrenMap` is a mapping of Parent ID → array of child IDs
 *  - `selectBranch`: call this to switch to a different branch/fork.
 *  - `getSiblingIdsSortedByDate`: returns the IDs of sibling messages sorted by createdAt ascending.
 *  - `retryMessage`: remove all messages after `messageId` and re-submit the last user message.
 *  - `editMessage`: remove all messages after `messageId`, push a new user message, and re-submit.
 */
export function useBranchingChat(options: UseBranchingChatOptions) {
  const chatId = options.id;
  const chatKey = ['fullTreeMessages', chatId];
  const generateId = options.generateId ?? generateIdFunc;
  const { onStop, onFinish } = options;

  // -------------------------------
  // 1. Full-tree messages in SWR
  // -------------------------------

  // Store an empty array as the initial full tree messages
  // (instead of using a default parameter value that gets re-created each time)
  // to avoid re-renders:
  const [noMessagesFallback] = useState([]);
  const { data: fullTreeMessages = [], mutate: mutateAll } = useSWR<
    BranchMessage[]
  >(chatKey, null, {
    fallbackData: options.initialMessages ?? noMessagesFallback,
  });

  // Keep a ref of the latest full conversation, so we never rely on stale state.
  const fullTreeMessagesRef = useRef<BranchMessage[]>(fullTreeMessages);
  useEffect(() => {
    fullTreeMessagesRef.current = fullTreeMessages || [];
  }, [fullTreeMessages]);

  // A setter that parallels setMessages from `useChat`.
  // If called with a function, we pass the ref instead of the previous state.
  const setFullTreeMessages = useCallback(
    (
      updater: BranchMessage[] | ((cur: BranchMessage[]) => BranchMessage[]),
    ) => {
      void mutateAll(() => {
        let next: BranchMessage[];

        if (typeof updater === 'function') {
          next = (updater as (x: BranchMessage[]) => BranchMessage[])(
            fullTreeMessagesRef.current,
          );
        } else {
          next = updater;
        }
        fullTreeMessagesRef.current = next;
        return next;
      }, false);
    },
    [mutateAll],
  );

  // ------------------------------------------------
  // 2. Current leaf ID (tip of the active branch)
  // ------------------------------------------------
  const [currentLeafId, setCurrentLeafId] = useState<UUID | undefined>(
    options.initialCurrentLeafId || fullTreeMessages.at(-1)?.id,
  );

  // Update the current leaf when the full tree messages change
  useEffect(() => {
    if (fullTreeMessages.length) {
      if (
        !currentLeafId ||
        !fullTreeMessages.some(msg => msg.id === currentLeafId)
      ) {
        setCurrentLeafId(fullTreeMessages.at(-1)!.id);
      }
    }
  }, [fullTreeMessages, currentLeafId]);

  // -------------------------------------
  // 3. Build adjacency + current branch
  // -------------------------------------
  // Build the adjacency mapping for the conversation tree.
  const { messagesById, childrenMap } = useMemo(() => {
    return buildAdjacency(fullTreeMessages);
  }, [fullTreeMessages]);

  // Compute the current branch (a linear array) using the tree helpers.
  const currentBranch = useMemo(() => {
    if (!currentLeafId) return [];
    return getConversationPath(messagesById, currentLeafId, fullTreeMessages);
  }, [messagesById, currentLeafId, fullTreeMessages]);

  // ----------------------------
  // 4. Track streaming status
  // ----------------------------
  const [isStreaming, setIsStreaming] = useState(false);

  // ------------------------------------------------------------------------------------
  // 5. The custom onFinish merges new assistant messages and updates the current leaf
  // ------------------------------------------------------------------------------------
  const customOnFinish = useCallback(
    (respMessage: UIMessage) => {
      setIsStreaming(false);
      setFullTreeMessages(messages => [
        ...messages,
        respMessage as BranchMessage,
      ]);
      setCurrentLeafId(respMessage.id as UUID);
      onFinish?.(respMessage);
    },
    [onFinish, setFullTreeMessages, setCurrentLeafId, setIsStreaming],
  );

  // -------------------------------------------
  // 6. The streaming chat (the active branch)
  // -------------------------------------------
  const {
    messages,
    setMessages,
    append,
    stop: stopStream,
    reload,
    setInput,
    input,
    isLoading,
    ...chat
  } = useChat({
    ...options,
    sendExtraMessageFields: true,
    streamProtocol: 'data',
    initialMessages: currentBranch,
    generateId,
    onFinish: customOnFinish,
  });

  // --------------------------------
  // 7. Branch navigation
  // --------------------------------
  // When a branch is selected, we find the "latest" leaf if there are multiple
  // branches below the chosen node, then build the path from the root to that final leaf.
  const selectBranch = useCallback(
    (leafId: UUID) => {
      const latestTree = fullTreeMessagesRef.current;
      const adj = buildAdjacency(latestTree);

      // Find the newest leaf that is a descendant of `leafId`.
      const finalLeaf = findLatestLeafDescendant(
        adj.messagesById,
        adj.childrenMap,
        leafId,
      );
      const finalLeafId = finalLeaf.id;

      // Update currentLeafId to that final descendant
      setCurrentLeafId(finalLeafId);

      // Build the path from the root to finalLeafId
      const newBranch = getConversationPath(
        adj.messagesById,
        finalLeafId,
        latestTree,
      );

      // Update useChat's messages to the new branch
      setMessages(newBranch);
    },
    [setMessages],
  );

  // ----------------------------------------------
  // 8.  Override the append method
  // ----------------------------------------------
  // Add the user message to the full tree before calling the original append.
  const originalAppend = append;

  const branchingAppend = useCallback(
    async (
      msg: BranchMessage | BranchMessageCreate,
      requestOptions?: ChatRequestOptions,
    ) => {
      const newMsg: BranchMessage = {
        id: (msg.id as UUID) ?? (generateId() as UUID),
        role: msg.role,
        content: msg.content ?? '',
        createdAt: msg.createdAt ?? new Date(),
        ...(msg.annotations && { annotations: msg.annotations }),
      };

      // If no parent is set, use the current leaf
      if (!newMsg.annotations?.length && currentLeafId) {
        newMsg.annotations = [{ parentId: currentLeafId }];
      }

      // Let useChat handle the streaming & attachment preparation:
      setIsStreaming(true);
      const result = await originalAppend(newMsg, requestOptions);

      // Insert new message into full tree
      const attachments = requestOptions?.experimental_attachments;
      // TODO: Support `FileList` attachments
      if (attachments) {
        if (!Array.isArray(attachments))
          throw new Error('Attachments must be an array of Attachment');
        newMsg.experimental_attachments = attachments;
      }
      setFullTreeMessages(prev => [...prev, newMsg]);
      return result;
    },
    [originalAppend, setFullTreeMessages, currentLeafId, generateId],
  );

  // ----------------------------------------------
  // 9. handleSubmit override
  // ----------------------------------------------
  // This replaces the standard handleSubmit from useChat
  // so we can do both local insertion and streaming together.
  const handleSubmit = useCallback(
    async (
      event?: { preventDefault?: () => void },
      requestOptions?: ChatRequestOptions,
    ) => {
      event?.preventDefault?.();
      if (!input.trim()) return;

      // Rely on branchingAppend to handle ID, date, attachments
      const newMsg = { role: 'user', content: input } as BranchMessage;
      setInput('');
      setIsStreaming(true);

      // Insert into the full tree and begin streaming
      await branchingAppend(newMsg, requestOptions);
    },
    [input, setInput, branchingAppend],
  );

  // ------------------------------------------------------------------------------------
  // Additional exposed methods:
  // ------------------------------------------------------------------------------------
  /**
   *  Helper to get sibling IDs sorted by createdAt (ascending).
   */
  const getSiblingIdsSortedByDate = (messageId: UUID) => {
    return getSiblingIdsSorted(messagesById, childrenMap, messageId);
  };

  /**
   *  Remove all messages after `messageId` (but keep that message),
   *  then call `reload`, which re-submits the last user message.
   */
  const retryMessage = useCallback(
    async (messageId: UUID, opts?: ChatRequestOptions) => {
      setMessages(messages => {
        const idx = messages.findIndex(m => m.id === messageId);
        if (idx === -1) {
          throw new Error(`retryMessage: messageId ${messageId} not found`);
        }
        return messages.slice(0, idx + 1);
      });
      setIsStreaming(true);
      await reload(opts);
    },
    [setMessages, reload, setIsStreaming],
  );

  /**
   *  Remove all messages after `messageId`, including that message,
   *  push a new user message to the tip (fresh content/id but same parent),
   *  then call `reload` which submits that user message in place of the old one.
   */
  const editMessage = useCallback(
    async (messageId: UUID, newContent: string, opts?: ChatRequestOptions) => {
      const fullTree = fullTreeMessagesRef.current;
      const oldMsg = fullTree.find(m => m.id === messageId);
      if (!oldMsg) {
        throw new Error(
          `editMessage: messageId ${messageId} not found in tree`,
        );
      }

      // Prepare a new user message with the same parent as the old one.
      const newMsg: BranchMessage = {
        id: generateId() as UUID,
        role: 'user',
        content: newContent,
        createdAt: new Date(),
        annotations: oldMsg.annotations,
        experimental_attachments: oldMsg.experimental_attachments,
      };

      // On the active branch, remove old message & everything after it, then add the new one:
      setMessages(messages => {
        const idx = messages.findIndex(m => m.id === messageId);
        if (idx === -1) {
          console.error(
            `editMessage: messageId ${messageId} not found in active branch`,
          );
          return messages;
        }
        return [...messages.slice(0, idx), newMsg] as BranchMessage[];
      });

      // Insert into the full conversation
      setFullTreeMessages(fullTree => [...fullTree, newMsg]);

      // let useChat handle the reload
      setIsStreaming(true);
      await reload(opts);
    },
    [setFullTreeMessages, reload, setMessages, generateId, setIsStreaming],
  );

  /**
   * Stop override to handle partial assistant message similarly to onFinish,
   *  If streaming is active, we finalize the partial message.
   *  If an `onBeforeStop` callback is provided, we allow it to transform or
   *  mutate the partial message before storing in the full tree.
   */
  const stop = useCallback(async () => {
    if (!isLoading) {
      // Not streaming, no partial to merge.
      stopStream();
      setIsStreaming(false);
      return;
    }
    const partialMessage = messages[messages.length - 1];
    stopStream();
    setIsStreaming(false);

    // Give the caller a chance to transform or do side effects
    const maybeTransformedMsg = onStop
      ? (await onStop?.(partialMessage)) ?? partialMessage
      : partialMessage;

    if (maybeTransformedMsg) {
      setFullTreeMessages(msgs => [
        ...msgs,
        maybeTransformedMsg as BranchMessage,
      ]);
      setCurrentLeafId(maybeTransformedMsg.id as UUID);
    }
  }, [
    isLoading,
    messages,
    stopStream,
    onStop,
    setFullTreeMessages,
    setIsStreaming,
    setCurrentLeafId,
  ]);

  // Return everything from `useChat`, plus tree-based helpers + overrides.
  return {
    messages,
    setMessages,
    reload,
    setInput,
    input,
    isLoading,
    ...chat,
    append: branchingAppend,
    stop,
    handleSubmit,
    fullTreeMessages,
    setFullTreeMessages,
    currentLeafId,
    selectBranch,
    messagesById,
    childrenMap,
    getSiblingIdsSortedByDate,
    retryMessage,
    editMessage,
    isStreaming,
  };
}
