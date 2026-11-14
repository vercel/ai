import ToolSpinner from './tool-spinner';

type FileToolPart = {
  state: string;
  input?: {
    file_path?: string;
    path?: string;
  };
};

export default function HarnessFileToolView({
  label,
  invocation,
}: {
  label: string;
  invocation: FileToolPart;
}) {
  const filePath = invocation.input?.file_path ?? invocation.input?.path;
  if (!filePath) {
    return null;
  }

  const running = invocation.state !== 'output-available';

  return (
    <div className="relative mb-2 text-sm text-gray-500">
      {running && <ToolSpinner />}
      <strong>{label}</strong>(<code>{filePath}</code>)
    </div>
  );
}
