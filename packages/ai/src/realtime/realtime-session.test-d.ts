import type {
  Experimental_RealtimeSessionOptions,
  Experimental_RealtimeSetupResponse,
  Warning,
} from '..';

declare const options: Experimental_RealtimeSessionOptions;
declare const setupResponse: Experimental_RealtimeSetupResponse;

const onWarning: ((warning: Warning) => void) | undefined = options.onWarning;
const setupWarnings: Warning[] | undefined = setupResponse.warnings;

void onWarning;
void setupWarnings;
