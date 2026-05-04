'use client';
import { useState } from 'react';
import type { Taxonomy, TaxonomyEntry, Recipe, Vibe } from '@/lib/types';
import { StreamView } from './_stream-view';

export function GenerateTestForm({ taxonomy }: { taxonomy: Taxonomy }) {
  const [projectName, setProjectName] = useState('Maple St Bakery');
  const [industry, setIndustry] = useState('Food & Beverage');
  const [vibe, setVibe] = useState<Vibe>('mom-and-pop');
  const [description, setDescription] = useState(
    'Family-run bakery; avoid generic cafe tropes; warm and considered.',
  );
  const [aestheticId, setAestheticId] = useState(taxonomy.aesthetics[0]?.id ?? 'editorial');
  const [layoutId, setLayoutId] = useState(taxonomy.layouts[0]?.id ?? 'editorial-spread');
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  function find(id: string, arr: TaxonomyEntry[]): TaxonomyEntry | undefined {
    return arr.find((e) => e.id === id);
  }

  function handleGenerate() {
    setFormError(null);
    const aesthetic = find(aestheticId, taxonomy.aesthetics);
    const layout = find(layoutId, taxonomy.layouts);
    if (!aesthetic || !layout) {
      setFormError('Unknown aesthetic/layout id');
      return;
    }
    setRecipe({
      brief: { projectName, industry, vibe, description },
      aesthetic,
      layout,
    });
    setStreaming(true);
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <div className="space-y-4">
        <Field label="Project name">
          <input
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
          />
        </Field>
        <Field label="Industry">
          <input
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
          />
        </Field>
        <Field label="Vibe">
          <select
            value={vibe}
            onChange={(e) => setVibe(e.target.value as Vibe)}
            className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
          >
            <option value="mom-and-pop">Mom &amp; Pop</option>
            <option value="scrappy-startup">Scrappy Startup</option>
            <option value="enterprise">Enterprise</option>
            <option value="custom">Custom</option>
          </select>
        </Field>
        <Field label="Description">
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
          />
        </Field>
        <Field label="Aesthetic">
          <select
            value={aestheticId}
            onChange={(e) => setAestheticId(e.target.value)}
            className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
          >
            {taxonomy.aesthetics.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
                {a.hasOverride ? ' ●' : ''}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Layout">
          <select
            value={layoutId}
            onChange={(e) => setLayoutId(e.target.value)}
            className="w-full border border-[var(--color-border)] rounded-[var(--radius-md)] px-3 py-2"
          >
            {taxonomy.layouts.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </Field>
        {formError && <p className="text-red-600 text-sm">{formError}</p>}
        <button
          onClick={handleGenerate}
          disabled={streaming}
          className="px-4 py-2 bg-[var(--color-ink)] text-[var(--color-surface)] rounded-[var(--radius-md)] disabled:opacity-50"
        >
          {streaming ? 'Generating…' : 'Generate'}
        </button>
      </div>
      <div>
        {recipe ? (
          <StreamView recipe={recipe} onDone={() => setStreaming(false)} />
        ) : (
          <p className="text-[var(--color-ink-muted)]">Fill the form and generate.</p>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="text-sm mb-1">{label}</div>
      {children}
    </label>
  );
}
