import { z } from 'zod';
import { zodSchema } from './zod-schema';

describe('zodSchema', () => {
  it('should create a schema from a zod schema', () => {
    const schema = zodSchema(z.object({ name: z.string() }));

    expect(schema.jsonSchema).toMatchSnapshot();
  });

  it('should duplicate inner schemas (and not use references)', () => {
    const Person = z.object({ name: z.string() });
    const Team = z.object({
      developers: z.array(Person),
      designers: z.array(Person),
    });

    const schema = zodSchema(Team);

    expect(schema.jsonSchema).toMatchSnapshot();
  });
});
