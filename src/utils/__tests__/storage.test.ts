import { describe, expect, it } from 'vitest';
import { getExtensionOptionsSnapshot, setExtensionOptionsSnapshot, publicOptions, sonarrSecrets } from '@/utils/storage';

describe('storage setExtensionOptionsSnapshot validation', () => {
  it('rejects invalid sonarr URL', async () => {
    await expect(
      setExtensionOptionsSnapshot({ sonarrUrl: 'notaurl', sonarrApiKey: '0123456789abcdef0123456789abcdef', defaults: { qualityProfileId: '', rootFolderPath: '', seriesType: 'anime', monitorOption: 'all', seasonFolder: true, searchForMissingEpisodes: true, tags: [] } }),
    ).rejects.toThrow(/Invalid Sonarr URL/);
  });

  it('rejects invalid api key format', async () => {
    await expect(
      setExtensionOptionsSnapshot({ sonarrUrl: 'https://sonarr.test', sonarrApiKey: 'short-key', defaults: { qualityProfileId: '', rootFolderPath: '', seriesType: 'anime', monitorOption: 'all', seasonFolder: true, searchForMissingEpisodes: true, tags: [] } }),
    ).rejects.toThrow(/Invalid Sonarr API key/);
  });

  it('normalizes trailing slash on URL and persists secrets', async () => {
    const apiKey = '0123456789abcdef0123456789abcdef';
    await setExtensionOptionsSnapshot({ sonarrUrl: 'https://sonarr.test/', sonarrApiKey: apiKey, defaults: { qualityProfileId: '', rootFolderPath: '', seriesType: 'anime', monitorOption: 'all', seasonFolder: true, searchForMissingEpisodes: true, tags: [] } });
    const pub = await publicOptions.getValue();
    const secrets = await sonarrSecrets.getValue();
    expect(pub.sonarrUrl).toBe('https://sonarr.test');
    expect(secrets.apiKey).toBe(apiKey);
    const snapshot = await getExtensionOptionsSnapshot();
    expect(snapshot.sonarrUrl).toBe('https://sonarr.test');
    expect(snapshot.sonarrApiKey).toBe(apiKey);
  });
});
