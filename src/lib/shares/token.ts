import crypto from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
// 62 chars. 16 chars × log2(62) ≈ 95.3 bits of entropy — far above
// the ~80-bit "post-quantum-safe-against-online-guessing" threshold.
const TOKEN_LENGTH = 16;
const TOKEN_REGEX = /^[A-Za-z0-9]{16}$/;

/**
 * Returns an unguessable 16-char base62 token suitable for use as a share URL
 * fragment. Each call returns fresh entropy from `crypto.randomBytes`.
 */
export function generateShareToken(): string {
  const bytes = crypto.randomBytes(TOKEN_LENGTH);
  let out = '';
  for (let i = 0; i < TOKEN_LENGTH; i++) {
    // Modulo bias is negligible at this entropy level (62 fits in 6 bits,
    // byte is 8). For brute-force resistance of a single token, this does
    // not move the needle.
    const byte = bytes[i];
    if (byte === undefined) continue;
    out += ALPHABET[byte % ALPHABET.length];
  }
  return out;
}

/**
 * Type guard: true iff the input is a string matching the canonical token
 * shape (`/^[A-Za-z0-9]{16}$/`). Called by every `[token]` route handler
 * before any DB lookup — Rule 4.
 */
export function isValidToken(s: unknown): s is string {
  return typeof s === 'string' && TOKEN_REGEX.test(s);
}
