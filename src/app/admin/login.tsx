'use client';
import { useState } from 'react';

export function AdminLogin() {
  const [secretInput, setSecretInput] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/sync', {
        headers: { 'x-admin-secret': secretInput },
      });
      if (res.status === 401) {
        setError('Invalid admin secret');
        return;
      }
      if (!res.ok) {
        setError(`Unexpected status ${res.status}`);
        return;
      }
      document.cookie = `fb_admin=${encodeURIComponent(secretInput)}; path=/; SameSite=Strict`;
      window.location.reload();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="max-w-md space-y-4">
      <label htmlFor="admin-secret" className="block text-sm">
        Admin secret
      </label>
      <input
        id="admin-secret"
        type="password"
        autoComplete="current-password"
        value={secretInput}
        onChange={(e) => setSecretInput(e.target.value)}
        className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2 focus:outline-none focus:border-[var(--color-accent)]"
      />
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <button
        type="submit"
        disabled={submitting || !secretInput}
        className="px-4 py-2 bg-[var(--color-ink)] text-[var(--color-surface)] rounded-[var(--radius-md)] disabled:opacity-50"
      >
        {submitting ? 'Verifying…' : 'Unlock'}
      </button>
    </form>
  );
}
