import { getSteering } from '../steering-store';

export type SteerRequest = {
  chatId: string;
  id: string;
  text: string;
  mode: 'steer' | 'queue';
};

export async function POST(req: Request) {
  const { chatId, id, text, mode }: SteerRequest = await req.json();
  const steering = getSteering(chatId);

  if (steering == null) {
    return Response.json(
      { error: 'No running response for this chat' },
      { status: 404 },
    );
  }

  const outcome =
    mode === 'queue'
      ? await steering.queue(text, { id })
      : await steering.steer(text, { id });

  return Response.json(outcome);
}
