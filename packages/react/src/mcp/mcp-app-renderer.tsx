import { useEffect, useMemo, useState } from 'react';
import { getMCPAppFromToolPart } from './get-mcp-app-from-tool-part';
import { MCPAppFrame } from './mcp-app-frame';
import type { MCPAppRendererProps, MCPAppResource } from './mcp-app-types';

function getToolPartOutput(part: MCPAppRendererProps['part']): unknown {
  return part.state === 'output-available' ? part.output : undefined;
}

export function MCPAppRenderer({
  part,
  sandbox,
  resource: resourceProp,
  loadResource,
  handlers,
  hostInfo,
  hostContext,
  fallback = null,
}: MCPAppRendererProps) {
  const app = useMemo(() => getMCPAppFromToolPart(part), [part]);
  const [loadedResource, setLoadedResource] = useState<
    MCPAppResource | undefined
  >(resourceProp);
  const [error, setError] = useState<Error | undefined>();

  useEffect(() => {
    setLoadedResource(resourceProp);
  }, [resourceProp]);

  useEffect(() => {
    if (app == null || resourceProp != null || loadResource == null) {
      return;
    }

    let cancelled = false;

    loadResource(app)
      .then(resource => {
        if (!cancelled) {
          setLoadedResource(resource);
        }
      })
      .catch(error => {
        if (!cancelled) {
          setError(error instanceof Error ? error : new Error(String(error)));
        }
      });

    return () => {
      cancelled = true;
    };
  }, [app, loadResource, resourceProp]);

  if (app == null || error != null || loadedResource == null) {
    return fallback;
  }

  return (
    <MCPAppFrame
      app={app}
      resource={loadedResource}
      input={part.input}
      output={getToolPartOutput(part)}
      sandbox={sandbox}
      handlers={handlers}
      hostInfo={hostInfo}
      hostContext={hostContext}
    />
  );
}
