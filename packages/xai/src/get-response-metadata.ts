export function getResponseMetadata({
  id,
  model,
  created,
  created_at,
}: {
  id?: string | undefined | null;
  created?: number | undefined | null;
  created_at?: number | undefined | null;
  model?: string | undefined | null;
}) {
  return {
    id: id ?? undefined,
    modelId: model ?? undefined,
    timestamp:
      created != null
        ? new Date(created * 1000)
        : created_at != null
          ? new Date(created_at * 1000)
          : undefined,
  };
}
