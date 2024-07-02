import { expectTypeOf } from 'vitest';

import {
  createAI,
  useActions,
  useAIState,
  useUIState,
  getAIState,
  type StreamableValue,
  type AIProvider,
} from './dist';

describe('StreamableValue type', () => {
  it('should not contain types marked with @internal after compilation', () => {
    expectTypeOf<StreamableValue>().not.toHaveProperty('type');
    expectTypeOf<StreamableValue>().not.toHaveProperty('curr');
    expectTypeOf<StreamableValue>().not.toHaveProperty('error');
    expectTypeOf<StreamableValue>().not.toHaveProperty('diff');
    expectTypeOf<StreamableValue>().not.toHaveProperty('next');
  });

  it('should yield a type error when assigning a wrong value', () => {
    expectTypeOf<StreamableValue<string>>().not.toEqualTypeOf<
      StreamableValue<boolean>
    >();

    expectTypeOf<StreamableValue<string>>().not.toEqualTypeOf<string>();

    expectTypeOf<
      StreamableValue<string>
    >().not.toEqualTypeOf<'THIS IS NOT A STREAMABLE VALUE'>();
  });
});

describe('createAI type', () => {
  it('should be inferred by useAIState()', () => {
    function testType() {
      const AI = createAI({
        actions: {},
        initialAIState: [1, 2, 3],
      });
      const [aiState] = useAIState<typeof AI>();
      return aiState;
    }

    type AIStateType = ReturnType<typeof testType>;
    expectTypeOf<AIStateType>().toEqualTypeOf<number[]>();
  });

  it('should be inferred by useUIState()', () => {
    function testType() {
      const AI = createAI({
        actions: {},
        initialUIState: [true, 'hi'],
      });
      const [uiState] = useUIState<typeof AI>();
      return uiState;
    }

    type UIStateType = ReturnType<typeof testType>;
    expectTypeOf<UIStateType>().toEqualTypeOf<(boolean | string)[]>();
  });

  it('should be inferred by useActions()', () => {
    function testType() {
      const AI = createAI({
        actions: {
          foo: async () => 123,
          bar: async () => 'hello',
        },
      });
      return useActions<typeof AI>();
    }

    type ActionsType = ReturnType<typeof testType>;

    expectTypeOf<ActionsType['foo']>().toEqualTypeOf<() => Promise<number>>();
    expectTypeOf<ActionsType['bar']>().toEqualTypeOf<() => Promise<string>>();
  });

  it('should workaround recursive type definitions using AIProvider type', () => {
    function testType() {
      type T_AIProvider = AIProvider<{
        str: string;
        num: number;
      }>;

      const AI = createAI({
        initialAIState: {
          str: 'hello',
          num: 123,
        },
        actions: {
          foo: async () => {
            const aiState = getAIState<T_AIProvider>();
            return [aiState];
          },
          bar: async () => 'hello',
        },
      });
      return useActions<typeof AI>();
    }

    type ActionsType = ReturnType<typeof testType>;

    expectTypeOf<ActionsType['foo']>().toEqualTypeOf<
      () => Promise<
        Readonly<{
          str: string;
          num: number;
        }>[]
      >
    >();
    expectTypeOf<ActionsType['bar']>().toEqualTypeOf<() => Promise<string>>();
  });
});
