export type Provider = 'sonarr' | 'radarr';

export interface ProviderCredentials {
  url: string;
  apiKey: string;
}

export type TitleLanguage = 'english' | 'romaji' | 'native';
