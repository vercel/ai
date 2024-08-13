import { createStreamableValue } from './create-streamable-value';

it('should return self', async () => {
  const value = createStreamableValue(1).update(2).update(3).done(4);

  expect(value.value).toMatchInlineSnapshot(`
      {
        "curr": 4,
        "type": Symbol(ui.streamable.value),
      }
    `);
});
