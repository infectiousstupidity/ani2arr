import type { SonarrSeries } from '@/types';
export interface ServerStatePatch {
  version?: string;
  requiredApiKey?: string;
  failNextAdd?: { status: number; body?: unknown } | null;
}

export async function resetServerState(baseUrl: string): Promise<void> {
  const response = await fetch(`${baseUrl}/__reset`, { method: 'POST' });
  if (!response.ok) {
    throw new Error(`Failed to reset test server state: ${response.status} ${response.statusText}`);
  }
}

export async function updateServerState(baseUrl: string, patch: ServerStatePatch): Promise<void> {
  const response = await fetch(`${baseUrl}/__state`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  });
  if (!response.ok) {
    throw new Error(`Failed to update test server state: ${response.status} ${response.statusText}`);
  }
}

export async function getSonarrSeries(baseUrl: string, apiKey?: string): Promise<SonarrSeries[]> {
  const init: RequestInit = apiKey
    ? { headers: { 'x-api-key': apiKey } }
    : {};
  const response = await fetch(`${baseUrl}/sonarr/api/v3/series`, init);
  if (!response.ok) {
    throw new Error(`Failed to fetch Sonarr series: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as SonarrSeries[];
}
