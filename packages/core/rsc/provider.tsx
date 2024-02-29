// This file provides the AI context to all AI Actions via AsyncLocalStorage.

import * as React from 'react';
import { InternalAIProvider } from './rsc-shared';
import {
  withAIState,
  getAIStateDeltaPromise,
  sealMutableAIState,
} from './ai-state';
import type {
  ServerWrappedActions,
  AIAction,
  AIActions,
  AIProvider,
  InternalAIStateStorageOptions,
  OnSetAIState,
  OnGetUIState,
} from './types';

async function innerAction<T>(
  {
    action,
    options,
  }: { action: AIAction; options: InternalAIStateStorageOptions },
  state: T,
  ...args: unknown[]
) {
  'use server';
  return await withAIState(
    {
      state,
      options,
    },
    async () => {
      const result = await action(...args);
      sealMutableAIState();
      return [getAIStateDeltaPromise() as Promise<T>, result];
    },
  );
}

function wrapAction<T = unknown>(
  action: AIAction,
  options: InternalAIStateStorageOptions,
) {
  return innerAction.bind(null, { action, options }) as AIAction<T>;
}

export function createAI<
  AIState = any,
  UIState = any,
  Actions extends AIActions = {},
>({
  actions,
  initialAIState,
  initialUIState,

  unstable_onSetAIState: onSetAIState,
  unstable_onGetUIState: onGetUIState,
}: {
  actions: Actions;
  initialAIState?: AIState;
  initialUIState?: UIState;

  unstable_onSetAIState?: OnSetAIState<AIState>;
  unstable_onGetUIState?: OnGetUIState<UIState>;
}) {
  // Wrap all actions with our HoC.
  const wrappedActions: ServerWrappedActions = {};
  for (const name in actions) {
    wrappedActions[name] = wrapAction(actions[name], {
      onSetAIState,
    });
  }

  const wrappedSyncUIState = onGetUIState
    ? wrapAction(onGetUIState, {})
    : undefined;

  async function AI(props: {
    children: React.ReactNode;
    initialAIState?: AIState;
    initialUIState?: UIState;
  }) {
    if ('useState' in React) {
      // This file must be running on the React Server layer.
      // Ideally we should be using `import "server-only"` here but we can have a
      // more customized error message with this implementation.
      throw new Error(
        'This component can only be used inside Server Components.',
      );
    }

    let uiState = props.initialUIState ?? initialUIState;
    let aiState = props.initialAIState ?? initialAIState;
    let aiStateDelta = undefined;

    if (wrappedSyncUIState) {
      const [newAIStateDelta, newUIState] = await wrappedSyncUIState(aiState);
      if (newUIState !== undefined) {
        aiStateDelta = newAIStateDelta;
        uiState = newUIState;
      }
    }

    return (
      <InternalAIProvider
        wrappedActions={wrappedActions}
        wrappedSyncUIState={wrappedSyncUIState}
        initialUIState={uiState}
        initialAIState={aiState}
        initialAIStatePatch={aiStateDelta}
      >
        {props.children}
      </InternalAIProvider>
    );
  }

  return AI as AIProvider<AIState, UIState, Actions>;
}
