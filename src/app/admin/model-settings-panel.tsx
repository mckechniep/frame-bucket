'use client';
import { useEffect, useState } from 'react';

import {
  DEFAULT_MODEL_SETTINGS,
  EFFORT_OPTIONS,
  MODEL_OPTIONS,
  STAGES,
  type Effort,
  type ModelSettings,
  type Stage,
} from '@/lib/settings/constants';

const SELECT_CLASS =
  'rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent-ring)]';

export function AdminModelSettingsPanel({ adminToken }: { adminToken: string }) {
  const [settings, setSettings] = useState<ModelSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/admin/settings', {
          headers: { 'x-admin-secret': adminToken },
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? 'failed to load settings');
        if (!cancelled) setSettings(body.settings as ModelSettings);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'unknown error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminToken]);

  function update(stage: Stage, patch: Partial<{ model: string; effort: Effort }>) {
    setSettings((prev) => (prev ? { ...prev, [stage]: { ...prev[stage], ...patch } } : prev));
    setSavedOk(false);
  }

  async function save() {
    if (!settings) return;
    setSaving(true);
    setError(null);
    setSavedOk(false);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'x-admin-secret': adminToken, 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? 'save failed');
      setSettings(body.settings as ModelSettings);
      setSavedOk(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-[var(--color-ink-muted)]">Loading model settings…</p>;
  }
  if (!settings) {
    return <p className="text-sm text-red-600">{error ?? 'Could not load settings.'}</p>;
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="text-left text-[var(--color-ink-muted)]">
              <th className="py-2 pr-4 font-medium">Stage</th>
              <th className="py-2 pr-4 font-medium">Model</th>
              <th className="py-2 font-medium">Effort (extended thinking)</th>
            </tr>
          </thead>
          <tbody>
            {STAGES.map((stage) => (
              <tr key={stage.id} className="border-t border-[var(--color-border)]">
                <td className="py-3 pr-4 align-top">
                  <div className="font-medium text-[var(--color-ink)]">{stage.label}</div>
                  <div className="text-xs text-[var(--color-ink-muted)]">{stage.hint}</div>
                </td>
                <td className="py-3 pr-4 align-top">
                  <select
                    aria-label={`${stage.label} model`}
                    value={settings[stage.id].model}
                    onChange={(e) => update(stage.id, { model: e.target.value })}
                    className={SELECT_CLASS}
                  >
                    {MODEL_OPTIONS.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-3 align-top">
                  <select
                    aria-label={`${stage.label} effort`}
                    value={settings[stage.id].effort}
                    onChange={(e) => update(stage.id, { effort: e.target.value as Effort })}
                    className={SELECT_CLASS}
                  >
                    {EFFORT_OPTIONS.map((eo) => (
                      <option key={eo.id} value={eo.id}>
                        {eo.label}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="max-w-prose text-xs text-[var(--color-ink-muted)]">
        Higher effort adds extended-thinking tokens — better reasoning, but more cost and latency.
        Thinking tokens bill as output and are already included in the wizard&apos;s cost readout.
        Defaults: Recommend = Haiku 4.5, Generate / Iterate / Add page = Opus 4.7.
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={save}
          disabled={saving}
          className="rounded-[var(--radius-md)] bg-[var(--color-ink)] px-4 py-2 text-[var(--color-surface)] disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save model settings'}
        </button>
        <button
          onClick={() => {
            setSettings(DEFAULT_MODEL_SETTINGS);
            setSavedOk(false);
          }}
          disabled={saving}
          className="rounded-[var(--radius-md)] border border-current px-4 py-2 disabled:opacity-50"
        >
          Reset to defaults
        </button>
        {savedOk && <span className="text-sm text-green-700">Saved.</span>}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
