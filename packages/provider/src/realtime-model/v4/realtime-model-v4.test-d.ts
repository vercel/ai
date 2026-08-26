import type {
  Experimental_RealtimeFactoryV4GetTokenResult,
  Experimental_RealtimeModelV4,
  Experimental_RealtimeModelV4ClientSecretResult,
  Experimental_RealtimeModelV4SessionConfig,
  SharedV4Warning,
} from '../..';

declare const model: Experimental_RealtimeModelV4;
declare const config: Experimental_RealtimeModelV4SessionConfig;
declare const clientSecret: Experimental_RealtimeModelV4ClientSecretResult;
declare const tokenResult: Experimental_RealtimeFactoryV4GetTokenResult;

const configWarnings: SharedV4Warning[] | undefined =
  model.getSessionConfigWarnings?.(config);
const clientSecretWarnings: SharedV4Warning[] | undefined =
  clientSecret.warnings;
const tokenWarnings: SharedV4Warning[] | undefined = tokenResult.warnings;

void configWarnings;
void clientSecretWarnings;
void tokenWarnings;
