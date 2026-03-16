// src/shared/utils/logger.ts

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

const DEFAULT_SCOPE = 'ani2arr';

const isDevBuild = Boolean(import.meta.env?.DEV);

const levelState: Record<LogLevel, boolean> = {
  debug: isDevBuild,
  info: isDevBuild,
  warn: isDevBuild,
  error: true,
};

const SENSITIVE_KEYS = new Set<string>([
  'apikey',
  'sonarrapikey',
  'radarrapikey',
  'api_key',
  'password',
  'token',
  'authorization',
  'auth',
  'x-api-key',
  'secret',
]);

function hasSensitiveKey(key: string): boolean {
  return SENSITIVE_KEYS.has(key.toLowerCase());
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === '[object Object]'
  );
}

function maybeParseJsonString(value: string): unknown {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }
  return value;
}

function redactValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || value === undefined) return value;

  if (typeof value === 'string') {
    const parsed = maybeParseJsonString(value);
    if (parsed !== value) {
      return redactValue(parsed, seen);
    }
    return value;
  }

  if (typeof value !== 'object') return value;

  if (typeof Headers !== 'undefined' && value instanceof Headers) {
    return redactObject(Object.fromEntries(value.entries()), seen);
  }

  if (typeof URLSearchParams !== 'undefined' && value instanceof URLSearchParams) {
    return redactObject(Object.fromEntries(value.entries()), seen);
  }

  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (Array.isArray(value)) {
    return value.map(item => redactValue(item, seen));
  }

  if (isPlainObject(value)) {
    return redactObject(value, seen);
  }

  return value;
}

function redactObject(
  obj: Record<string, unknown>,
  seen: WeakSet<object>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};

  for (const [key, val] of Object.entries(obj)) {
    if (hasSensitiveKey(key)) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = redactValue(val, seen);
    }
  }

  return out;
}

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

  const safeArgs = args.map(arg => redactValue(arg, new WeakSet<object>()));

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
