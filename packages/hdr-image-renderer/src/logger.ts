/**
 * Debug logger for HDR Image Renderer
 *
 * When debug is enabled, logs are forwarded to console.
 * When disabled, all logging is a no-op (zero overhead).
 */

export interface Logger {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
}

const noop = () => {};

export const silentLogger: Logger = { log: noop, warn: noop };

export function createLogger(debug: boolean): Logger {
  return debug ? console : silentLogger;
}
