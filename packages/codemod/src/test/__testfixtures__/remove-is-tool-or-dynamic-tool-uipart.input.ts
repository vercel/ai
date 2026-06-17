import { isToolOrDynamicToolUIPart } from 'ai';

declare const part: any;

const isToolPart = isToolOrDynamicToolUIPart(part);
