import { afterEach, describe, expect, it, vi } from 'vitest';
import { logger } from '../logger';

describe('logger', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('formats info messages with level prefix', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.info('hello');
    expect(spy).toHaveBeenCalledWith('[info] hello');
  });

  it('appends meta as JSON when provided', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.info('event', { count: 3 });
    expect(spy).toHaveBeenCalledWith('[info] event {"count":3}');
  });

  it('warn level routes through console.warn with [warn] prefix', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('be careful', { reason: 'maybe' });
    expect(spy).toHaveBeenCalledWith('[warn] be careful {"reason":"maybe"}');
  });

  it('captures Error message and stack into error meta', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('boom');
    logger.error('failed', err);

    expect(spy).toHaveBeenCalledTimes(1);
    const arg = spy.mock.calls[0]?.[0];
    expect(typeof arg).toBe('string');
    expect(arg).toContain('[error] failed');
    expect(arg).toContain('"error":"boom"');
    expect(arg).toContain('"stack":');
  });

  it('handles non-Error error values', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('failed', 'some-string-error');

    const arg = spy.mock.calls[0]?.[0];
    expect(arg).toContain('"error":"some-string-error"');
  });

  it('emits plain message when no error or meta is supplied', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('crash');
    expect(spy).toHaveBeenCalledWith('[error] crash');
  });
});
