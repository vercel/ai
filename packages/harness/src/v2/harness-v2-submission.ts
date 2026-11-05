import type { UserModelMessage } from '@ai-sdk/provider-utils';
import type { HarnessV2TurnSettings } from './harness-v2-turn-settings';

/**
 * User input accepted by a harness session.
 */
export type HarnessV2Submission =
  | {
      /**
       * Starts a new user turn.
       */
      readonly type: 'prompt';

      /**
       * User message delivered to the harness.
       */
      readonly message: UserModelMessage;

      /**
       * Settings that apply to this turn.
       */
      readonly settings: HarnessV2TurnSettings;
    }
  | {
      /**
       * Adds direction to the currently active turn without starting a new one.
       */
      readonly type: 'steer';

      /**
       * User message inserted into the active turn.
       */
      readonly message: UserModelMessage;
    };
