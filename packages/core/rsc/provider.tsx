// This file provides the AI context to all AI Actions via AsyncLocalStorage.

import * as React from 'react';
import * as jsondiffpatch from 'jsondiffpatch';

import type {
  ServerWrappedActions,
  AIAction,
  AIActions,
  AIProvider,
  InternalAIStateStorageOptions,
  OnSetAIState,
  OnGetUIState,
} from './types';

import { InternalAIProvider } from './rsc-shared.mjs';
import {
  withAIState,
  getAIStateDeltaPromise,
  sealMutableAIState,
} from './ai-state';
import { createResolvablePromise } from './utils';

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

async function bulkActions<T, D, R>(
  initialState: any,
  wrappedActions: [AIAction<T, [D, R]>, args: T[]][],
): Promise<[Promise<D | undefined>, Promise<R>[]]> {
  'use server';

  let state = initialState;

  let diffPromise = Promise.resolve<D | undefined>(undefined);
  const results: Promise<R>[] = [];
  const resolveResults: {
    resolve: (value: R) => void;
    reject: (error: Error) => void;
  }[] = [];

  // This makes it possible to return earlier results before waiting for next
  // action to be executed.
  for (let i = 0; i < wrappedActions.length; i++) {
    const { resolve, reject, promise } = createResolvablePromise<R>();
    resolveResults.push({ resolve, reject });
    results.push(promise);
  }

  // Execute all actions in order.
  for (let i = 0; i < wrappedActions.length; i++) {
    const [action, args] = wrappedActions[i];

    try {
      const [diff, result] = await action(state, ...args);
      resolveResults[i].resolve(result);

      if (i === wrappedActions.length - 1) {
        // Last action
        diffPromise = Promise.resolve(diff);
      } else {
        // Not the last action, apply the diff and continue.
        const delta = await diff;
        if (delta) {
          state = jsondiffpatch.patch(jsondiffpatch.clone(state), delta);
        }
      }
    } catch (e) {
      console.error(e);

      // Reject all remaining results and return.
      // It's fine to return directly because diffPromise should be undefined at this point
      // so it won't affect the client state.
      for (let j = i; j < wrappedActions.length; j++) {
        resolveResults[j].reject(e as Error);
      }
    }
  }

  return [
    diffPromise.then(delta => {
      if (delta) {
        state = jsondiffpatch.patch(jsondiffpatch.clone(state), delta);
      }
      return jsondiffpatch.diff(initialState, state) as D;
    }),
    results,
  ];
}

export function createAI<
  AIState = any,
  UIState = any,
  Actions extends AIActions = {},
>({
  actions,
  initialAIState,
  initialUIState,

  onSetAIState,
  onGetUIState,
}: {
  actions: Actions;
  initialAIState?: AIState;
  initialUIState?: UIState;

  /**
   * This function is called whenever the AI state is updated by an Action.
   * You can use this to persist the AI state to a database, or to send it to a
   * logging service.
   */
  onSetAIState?: OnSetAIState<AIState>;

  /**
   * This function is used to retrieve the UI state based on the AI state.
   * For example, to render the initial UI state based on a given AI state, or
   * to sync the UI state when the application is already loaded.
   *
   * If returning `undefined`, the client side UI state will not be updated.
   *
   * This function must be annotated with the `"use server"` directive.
   *
   * @example
   * ```tsx
   * onGetUIState: async () => {
   *   'use server';
   *
   *   const currentAIState = getAIState();
   *   const externalAIState = await loadAIStateFromDatabase();
   *
   *   if (currentAIState === externalAIState) return undefined;
   *
   *   // Update current AI state and return the new UI state
   *   const state = getMutableAIState()
   *   state.done(externalAIState)
   *
   *   return <div>...</div>;
   * }
   * ```
   */
  onGetUIState?: OnGetUIState<UIState>;
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

  const AI: AIProvider<AIState, UIState, Actions> = async props => {
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
        bulkActions={bulkActions}
        initialUIState={uiState}
        initialAIState={aiState}
        initialAIStatePatch={aiStateDelta}
      >
        {props.children}
      </InternalAIProvider>
    );
  };

  return AI;
}
