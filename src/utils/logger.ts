// src/utils/logger.ts

/**
 * @file Lightweight logging utility that respects the current build mode.
 * Logs are suppressed outside of development unless explicitly enabled.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
  /** Enable or disable verbose logging (`debug`, `info`, `warn`). */
  enabled?: boolean;
  /** Override individual log levels. */
  levels?: Partial<Record<LogLevel, boolean>>;
}

export interface ScopedLogger {
  debug: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
}

const DEFAULT_SCOPE = 'Kitsunarr';

const isDevBuild = Boolean(import.meta.env?.DEV);

const levelState: Record<LogLevel, boolean> = {
  debug: isDevBuild,
  info: isDevBuild,
  warn: isDevBuild,
  error: true,
};

function formatPrefix(scope?: string): string {
  return scope ? `[${DEFAULT_SCOPE} | ${scope}]` : `[${DEFAULT_SCOPE}]`;
}

function isLevelEnabled(level: LogLevel): boolean {
  return levelState[level];
}

function emit(level: LogLevel, scope: string | undefined, args: unknown[]): void {
  if (!isLevelEnabled(level)) return;

  const prefix = formatPrefix(scope);
  const consoleMethod = (console[level] ?? console.log) as (...data: unknown[]) => void;

  if (args.length === 0) {
    consoleMethod.call(console, prefix);
    return;
  }

  // Redact sensitive fields from arguments to avoid leaking credentials
  const SENSITIVE_KEYS = new Set([
    'apiKey',
    'sonarrApiKey',
    'api_key',
    'sonarrUrl',
    'sonarr_url',
    // keep benign URLs visible; redact only when credentials are present
    'password',
    'token',
    'authorization',
    'auth',
    'x-api-key',
    'X-Api-Key',
  ]);

  function redactValue(value: unknown, depth = 0): unknown {
    if (depth > 5) return '[REDACTED]';
    if (value === null || value === undefined) return value;
    const t = typeof value;
    if (t === 'string') {
      // Redact URLs containing API keys in query params or paths
      const str = value as string;
      if (str.includes('apikey=') || str.includes('api_key=') || str.includes('token=')) {
        return '[REDACTED_URL]';
      }
      return value;
    }
    if (t === 'number' || t === 'boolean') return value;
    if (Array.isArray(value)) return value.map((v) => redactValue(v, depth + 1));
    if (t === 'object') {
      try {
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          const lowerKey = k.toLowerCase();
          // Check both exact match and case-insensitive match for HTTP headers
          if (SENSITIVE_KEYS.has(k) || SENSITIVE_KEYS.has(lowerKey)) {
            out[k] = '[REDACTED]';
          } else {
            out[k] = redactValue(v, depth + 1);
          }
        }
        return out;
      } catch {
        return '[REDACTED]';
      }
    }
    return '[REDACTED]';
  }

  function redactArg(arg: unknown): unknown {
    if (typeof arg === 'object' && arg !== null) {
      return redactValue(arg);
    }
    return arg;
  }

  const safeArgs = args.map(redactArg);

  const [first, ...rest] = safeArgs;
  if (typeof first === 'string') {
    consoleMethod.call(console, `${prefix} ${first}`, ...rest);
  } else {
    consoleMethod.call(console, prefix, first, ...rest);
  }
}

function createScopedLogger(scope?: string): ScopedLogger {
  return {
    debug: (...args: unknown[]) => emit('debug', scope, args),
    info: (...args: unknown[]) => emit('info', scope, args),
    warn: (...args: unknown[]) => emit('warn', scope, args),
    error: (...args: unknown[]) => emit('error', scope, args),
  };
}

function configureLogger(options: LoggerOptions): void {
  if (typeof options.enabled === 'boolean') {
    levelState.debug = options.enabled;
    levelState.info = options.enabled;
    levelState.warn = options.enabled;
  }

  if (options.levels) {
    for (const [level, value] of Object.entries(options.levels) as Array<[LogLevel, boolean | undefined]>) {
      if (typeof value === 'boolean') {
        levelState[level] = value;
      }
    }
  }
}

export const logger = Object.assign(createScopedLogger(), {
  create: (scope?: string) => createScopedLogger(scope),
  configure: (options: LoggerOptions) => configureLogger(options),
  isLevelEnabled: (level: LogLevel) => isLevelEnabled(level),
});

export type Logger = typeof logger;
