export enum ErrorCode {
  NETWORK_ERROR = 'NETWORK_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  PERMISSION_ERROR = 'PERMISSION_ERROR',
  API_ERROR = 'API_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  SONARR_NOT_CONFIGURED = 'SONARR_NOT_CONFIGURED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface ExtensionError {
  code: ErrorCode;
  message: string;
  userMessage: string;
  details?: Record<string, unknown>;
  readonly timestamp: number;
}
