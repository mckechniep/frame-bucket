// Lightweight leveled logger. M0 wraps console (warn/error are ESLint-allowed)
// so future swap to pino touches one module, not every caller.
// TODO(M2): swap for pino when structured ingestion lands.

type Meta = Record<string, unknown>;

function format(level: string, message: string, meta?: Meta): string {
  const base = `[${level}] ${message}`;
  if (!meta || Object.keys(meta).length === 0) return base;
  return `${base} ${JSON.stringify(meta)}`;
}

export const logger = {
  info(message: string, meta?: Meta): void {
    console.warn(format('info', message, meta));
  },

  warn(message: string, meta?: Meta): void {
    console.warn(format('warn', message, meta));
  },

  error(message: string, error?: unknown, meta?: Meta): void {
    const errorMeta: Meta = { ...meta };
    if (error instanceof Error) {
      errorMeta.error = error.message;
      if (error.stack) errorMeta.stack = error.stack;
    } else if (error !== undefined) {
      errorMeta.error = String(error);
    }
    console.error(format('error', message, errorMeta));
  },
};

export type Logger = typeof logger;
