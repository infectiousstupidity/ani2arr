export type MediaService = 'sonarr' | 'radarr';

export interface ArrCredentialsPayload {
  url: string;
  apiKey: string;
}

export type TitleLanguage = 'english' | 'romaji' | 'native';
