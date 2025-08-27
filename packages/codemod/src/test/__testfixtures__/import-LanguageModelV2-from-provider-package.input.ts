// @ts-nocheck
import { LanguageModelV1 } from '@ai-sdk/provider';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { LanguageModelV1Middleware } from '@ai-sdk/provider';
import { LanguageModelV2Middleware } from '@ai-sdk/provider';
import { someOtherFunction } from '@ai-sdk/provider';

// Multiple imports in one declaration
import { 
  LanguageModelV1 as LMV1Multi, 
  LanguageModelV2 as LMV2Multi, 
  LanguageModelV1Middleware as LMV1MiddlewareMulti,
  LanguageModelV2Middleware as LMV2MiddlewareMulti,
  anotherFunction 
} from '@ai-sdk/provider';

// Import with alias
import { LanguageModelV1 as LMV1 } from '@ai-sdk/provider';

// Mixed imports
import { LanguageModelV1 as LMV1Mixed, generateText } from '@ai-sdk/provider';

// Should not affect other packages
import { LanguageModelV1 as LMV1Other } from 'some-other-package';
import { LanguageModelV2 as LMV2Other } from 'another-package';
