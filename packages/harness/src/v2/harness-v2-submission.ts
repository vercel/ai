import type { UserModelMessage } from '@ai-sdk/provider-utils';
import type { HarnessV2TurnSettings } from './harness-v2-turn-settings';

export type HarnessV2Submission =
  | {
      readonly type: 'prompt';
      readonly message: UserModelMessage;
      readonly settings: HarnessV2TurnSettings;
    }
  | {
      readonly type: 'steer';
      readonly message: UserModelMessage;
    };
