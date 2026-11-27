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
       * Settings that apply to this turn. When multiple queued prompts are
       * delivered together as a single turn, the adapter must use the settings
       * from the latest queued prompt among them.
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
    }
  | {
      /**
       * Cancels the turn that is running when the cancel is recorded. The
       * harness stops the turn's work and finishes the turn with finish reason
       * `cancelled`, which delivers the cancel. A cancel recorded while no turn
       * is running, or whose turn finishes with another reason, is withdrawn.
       * Prompts waiting for a later turn are not affected.
       */
      readonly type: 'cancel';
    };
