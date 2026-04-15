import { describe, expectTypeOf, it } from 'vitest';
import {
  DataUIPart,
  InferUIMessagePart,
  InferUIMessagePartMetadata,
  isDynamicToolUIPart,
  isReasoningUIPart,
  isTextUIPart,
  isToolUIPart,
  StepStartUIPart,
  UIDataTypes,
  UIMessage,
  UIMessagePart,
  UITools,
} from './ui-messages';

describe('Part metadata types', () => {
  it('UIMessage without 4th generic defaults to unknown part metadata', () => {
    type Msg = UIMessage<{ foo: string }>;
    type Part = Msg['parts'][number];
    type Text = Extract<Part, { type: 'text' }>;
    expectTypeOf<Text['metadata']>().toEqualTypeOf<unknown | undefined>();
  });

  it('UIMessage with no generics still works', () => {
    type Msg = UIMessage;
    expectTypeOf<Msg['metadata']>().toEqualTypeOf<unknown | undefined>();
  });

  it('UIMessage<M, D, T> (3 generics) still works', () => {
    type Msg = UIMessage<{ a: 1 }, UIDataTypes, UITools>;
    type Part = Msg['parts'][number];
    type Text = Extract<Part, { type: 'text' }>;
    expectTypeOf<Text['metadata']>().toEqualTypeOf<unknown | undefined>();
  });

  it('UIMessage<M, D, T, PM> parts have metadata?: PM', () => {
    type PM = { planId: string };
    type Msg = UIMessage<unknown, UIDataTypes, UITools, PM>;
    type Part = Msg['parts'][number];

    type Text = Extract<Part, { type: 'text' }>;
    expectTypeOf<Text['metadata']>().toEqualTypeOf<PM | undefined>();

    type Reasoning = Extract<Part, { type: 'reasoning' }>;
    expectTypeOf<Reasoning['metadata']>().toEqualTypeOf<PM | undefined>();

    type Custom = Extract<Part, { type: 'custom' }>;
    expectTypeOf<Custom['metadata']>().toEqualTypeOf<PM | undefined>();

    type File = Extract<Part, { type: 'file' }>;
    expectTypeOf<File['metadata']>().toEqualTypeOf<PM | undefined>();

    type ReasoningFile = Extract<Part, { type: 'reasoning-file' }>;
    expectTypeOf<ReasoningFile['metadata']>().toEqualTypeOf<PM | undefined>();

    type SourceUrl = Extract<Part, { type: 'source-url' }>;
    expectTypeOf<SourceUrl['metadata']>().toEqualTypeOf<PM | undefined>();

    type SourceDoc = Extract<Part, { type: 'source-document' }>;
    expectTypeOf<SourceDoc['metadata']>().toEqualTypeOf<PM | undefined>();
  });

  it('tool parts have metadata?: PM in all states', () => {
    type PM = { planId: string };
    type Msg = UIMessage<unknown, UIDataTypes, UITools, PM>;
    type Part = Msg['parts'][number];

    type DynTool = Extract<Part, { type: 'dynamic-tool' }>;
    expectTypeOf<DynTool['metadata']>().toEqualTypeOf<PM | undefined>();
  });

  it('StepStartUIPart has no metadata', () => {
    expectTypeOf<StepStartUIPart>().not.toHaveProperty('metadata');
  });

  it('DataUIPart has no metadata', () => {
    type D = DataUIPart<{ foo: string }>;
    expectTypeOf<D>().not.toHaveProperty('metadata');
  });

  it('InferUIMessagePartMetadata extracts PM from UIMessage', () => {
    type PM = { planId: string; step: number };
    type Msg = UIMessage<{ foo: string }, UIDataTypes, UITools, PM>;
    expectTypeOf<InferUIMessagePartMetadata<Msg>>().toEqualTypeOf<PM>();
  });

  it('InferUIMessagePartMetadata defaults to unknown', () => {
    type Msg = UIMessage<{ foo: string }>;
    expectTypeOf<InferUIMessagePartMetadata<Msg>>().toEqualTypeOf<unknown>();
  });

  it('InferUIMessagePart includes typed metadata', () => {
    type PM = { planId: string };
    type Msg = UIMessage<unknown, UIDataTypes, UITools, PM>;
    type Part = InferUIMessagePart<Msg>;
    type Text = Extract<Part, { type: 'text' }>;
    expectTypeOf<Text['metadata']>().toEqualTypeOf<PM | undefined>();
  });

  it('isTextUIPart preserves PART_METADATA through narrowing', () => {
    type PM = { planId: string };
    const part = {} as UIMessagePart<UIDataTypes, UITools, PM>;
    if (isTextUIPart(part)) {
      expectTypeOf(part.metadata).toEqualTypeOf<PM | undefined>();
    }
  });

  it('isReasoningUIPart preserves PART_METADATA through narrowing', () => {
    type PM = { planId: string };
    const part = {} as UIMessagePart<UIDataTypes, UITools, PM>;
    if (isReasoningUIPart(part)) {
      expectTypeOf(part.metadata).toEqualTypeOf<PM | undefined>();
    }
  });

  it('isToolUIPart preserves PART_METADATA through narrowing', () => {
    type PM = { planId: string };
    const part = {} as UIMessagePart<UIDataTypes, UITools, PM>;
    if (isToolUIPart(part)) {
      expectTypeOf(part.metadata).toEqualTypeOf<PM | undefined>();
    }
  });

  it('isDynamicToolUIPart preserves PART_METADATA through narrowing', () => {
    type PM = { planId: string };
    const part = {} as UIMessagePart<UIDataTypes, UITools, PM>;
    if (isDynamicToolUIPart(part)) {
      expectTypeOf(part.metadata).toEqualTypeOf<PM | undefined>();
    }
  });

  it('part.type narrowing preserves PART_METADATA', () => {
    type PM = { planId: string };
    type Msg = UIMessage<unknown, UIDataTypes, UITools, PM>;
    const parts = [] as Msg['parts'];
    for (const part of parts) {
      if (part.type === 'text') {
        expectTypeOf(part.metadata).toEqualTypeOf<PM | undefined>();
      }
      if (part.type === 'reasoning') {
        expectTypeOf(part.metadata).toEqualTypeOf<PM | undefined>();
      }
      if (part.type === 'dynamic-tool') {
        expectTypeOf(part.metadata).toEqualTypeOf<PM | undefined>();
      }
      if (part.type === 'file') {
        expectTypeOf(part.metadata).toEqualTypeOf<PM | undefined>();
      }
      if (part.type === 'step-start') {
        expectTypeOf(part).not.toHaveProperty('metadata');
      }
    }
  });
});
