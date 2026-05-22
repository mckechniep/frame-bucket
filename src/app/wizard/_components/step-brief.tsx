'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

import { BriefSchema } from '@/lib/schemas/recommendation';
import type { Vibe } from '@/lib/types';
import { stepPath } from '@/lib/wizard/steps';
import { useWizardStore } from '@/lib/wizard/store';

const VIBE_OPTIONS: Array<{ value: Vibe; label: string; tagline: string }> = [
  {
    value: 'mom-and-pop',
    label: 'Mom & Pop',
    tagline: 'Warm, hand-considered, local',
  },
  {
    value: 'scrappy-startup',
    label: 'Scrappy Startup',
    tagline: 'Lean, expressive, opinionated',
  },
  {
    value: 'enterprise',
    label: 'Enterprise',
    tagline: 'Calm, restrained, institutional',
  },
  {
    value: 'custom',
    label: 'Custom',
    tagline: 'Describe it yourself',
  },
];

export function StepBrief() {
  // BriefForm's input state is seeded from the store via useState
  // initializers — those only fire on first render. Remount the form
  // whenever the store's brief flips between absent and present so the
  // initializers re-read the fresh snapshot. Fixes two cases:
  //   1. "Start over" calls store.reset() while we're already on
  //      /wizard/brief (router.push to the same route is a no-op).
  //      Without a remount, the inputs would still hold previous text.
  //   2. A returning user with a persisted brief lands here before
  //      Zustand's deferred rehydration finishes — the remount on
  //      rehydrate lets useState seed from the populated store.
  // This is the React 19 idiomatic alternative to setState-in-effect.
  const existingBrief = useWizardStore((s) => s.brief);
  return <BriefForm key={existingBrief ? 'has-brief' : 'cleared'} />;
}

function BriefForm() {
  const router = useRouter();

  const existingBrief = useWizardStore((s) => s.brief);
  const setBrief = useWizardStore((s) => s.setBrief);
  const setRecommendation = useWizardStore((s) => s.setRecommendation);
  const setSelectedRecipe = useWizardStore((s) => s.setSelectedRecipe);

  const [projectName, setProjectName] = useState(existingBrief?.projectName ?? '');
  const [industry, setIndustry] = useState(existingBrief?.industry ?? '');
  const [vibe, setVibe] = useState<Vibe>(existingBrief?.vibe ?? 'mom-and-pop');
  const [customVibe, setCustomVibe] = useState(existingBrief?.customVibe ?? '');
  const [description, setDescription] = useState(existingBrief?.description ?? '');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFieldErrors({});

    const candidate = {
      projectName: projectName.trim(),
      industry: industry.trim(),
      vibe,
      description: description.trim(),
      ...(vibe === 'custom' && customVibe.trim() ? { customVibe: customVibe.trim() } : {}),
    };

    const parsed = BriefSchema.safeParse(candidate);
    if (!parsed.success) {
      const errors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path.join('.') || '_';
        if (!errors[key]) errors[key] = issue.message;
      }
      setFieldErrors(errors);
      return;
    }

    const newBrief = parsed.data;
    const briefChanged =
      !existingBrief || JSON.stringify(existingBrief) !== JSON.stringify(newBrief);
    setBrief(newBrief);
    if (briefChanged) {
      // A new brief invalidates whatever recommendation + recipe we cached
      // for the previous one. Without this, the recommend step would silently
      // serve stale picks against a brief the user no longer cares about.
      setRecommendation(null);
      setSelectedRecipe(null);
    }
    router.push(stepPath('recommend'));
  }

  return (
    <section className="mx-auto max-w-[760px] px-[var(--space-8)] py-[var(--space-16)]">
      <header className="mb-[var(--space-12)]">
        <p className="text-[var(--text-base)] uppercase tracking-[0.15em] text-[var(--color-ink-muted)]">
          Step 1 of 3
        </p>
        <h1 className="mt-[var(--space-3)] font-[family-name:var(--font-display)] text-[var(--text-hero)] leading-[1.05] tracking-tight">
          Tell us about the project.
        </h1>
        <p className="mt-[var(--space-4)] max-w-[60ch] text-[var(--text-lg)] leading-relaxed text-[var(--color-ink-muted)]">
          Four short answers. The recommender uses them to pick an aesthetic and layout that fit the
          work — not a generic template.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-[var(--space-8)]" noValidate>
        <Field label="Project name" htmlFor="projectName" error={fieldErrors.projectName}>
          <input
            id="projectName"
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder="Maple St Bakery"
            className={inputClass(Boolean(fieldErrors.projectName))}
            autoComplete="off"
          />
        </Field>

        <Field label="Industry" htmlFor="industry" error={fieldErrors.industry}>
          <input
            id="industry"
            type="text"
            value={industry}
            onChange={(e) => setIndustry(e.target.value)}
            placeholder="Food & Beverage"
            className={inputClass(Boolean(fieldErrors.industry))}
            autoComplete="off"
          />
        </Field>

        <fieldset className="space-y-[var(--space-3)]">
          <legend className="text-[var(--text-base)] font-medium text-[var(--color-ink)]">
            Vibe
          </legend>
          <div className="grid grid-cols-1 gap-[var(--space-3)] sm:grid-cols-2">
            {VIBE_OPTIONS.map((option) => {
              const checked = vibe === option.value;
              return (
                <label
                  key={option.value}
                  className={[
                    'flex cursor-pointer flex-col gap-[var(--space-1)] rounded-[var(--radius-md)]',
                    'border px-[var(--space-4)] py-[var(--space-3)]',
                    'transition-colors duration-[var(--duration-fast)]',
                    checked
                      ? 'border-[var(--color-accent)] bg-[color-mix(in_oklch,var(--color-accent)_8%,transparent)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-ink-muted)]',
                  ].join(' ')}
                >
                  <input
                    type="radio"
                    name="vibe"
                    value={option.value}
                    checked={checked}
                    onChange={() => setVibe(option.value)}
                    className="sr-only"
                  />
                  <span className="text-[var(--text-base)] font-medium text-[var(--color-ink)]">
                    {option.label}
                  </span>
                  <span className="text-[var(--text-base)] text-[var(--color-ink-muted)]">
                    {option.tagline}
                  </span>
                </label>
              );
            })}
          </div>
          {fieldErrors.vibe ? <FieldError message={fieldErrors.vibe} /> : null}
        </fieldset>

        {vibe === 'custom' ? (
          <Field
            label="Describe the custom vibe"
            htmlFor="customVibe"
            error={fieldErrors.customVibe}
          >
            <input
              id="customVibe"
              type="text"
              value={customVibe}
              onChange={(e) => setCustomVibe(e.target.value)}
              placeholder="Editorial, sober, a bit Swiss…"
              className={inputClass(Boolean(fieldErrors.customVibe))}
              autoComplete="off"
            />
          </Field>
        ) : null}

        <Field
          label="What does the project need to communicate?"
          htmlFor="description"
          error={fieldErrors.description}
          hint="A sentence or two is enough. Mention what to avoid if anything obvious comes to mind."
        >
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            placeholder="Family-run bakery; avoid generic cafe tropes; warm and considered."
            className={inputClass(Boolean(fieldErrors.description))}
          />
        </Field>

        <div className="flex items-center justify-end gap-[var(--space-4)] pt-[var(--space-4)]">
          <button
            type="submit"
            className={[
              'inline-flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)]',
              'bg-[var(--color-accent)] px-[var(--space-6)] py-[var(--space-3)]',
              'text-[var(--text-base)] font-medium text-[var(--color-surface)]',
              'transition-transform duration-[var(--duration-fast)] hover:-translate-y-px',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2',
              'focus-visible:outline-[var(--color-ink)]',
            ].join(' ')}
          >
            Continue to recommendations
            <span aria-hidden>→</span>
          </button>
        </div>
      </form>
    </section>
  );
}

function inputClass(hasError: boolean): string {
  return [
    'w-full rounded-[var(--radius-md)] border bg-[var(--color-surface)]',
    'px-[var(--space-4)] py-[var(--space-3)]',
    'text-[var(--text-base)] text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]',
    'transition-colors duration-[var(--duration-fast)]',
    hasError
      ? 'border-[color-mix(in_oklch,oklch(55%_0.18_25)_70%,var(--color-border))]'
      : 'border-[var(--color-border)] hover:border-[var(--color-ink-muted)]',
    'focus:outline-none focus:border-[var(--color-accent)]',
    'focus:ring-2 focus:ring-[color-mix(in_oklch,var(--color-accent)_30%,transparent)]',
  ].join(' ');
}

interface FieldProps {
  label: string;
  htmlFor: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}

function Field({ label, htmlFor, error, hint, children }: FieldProps) {
  return (
    <div className="space-y-[var(--space-2)]">
      <label
        htmlFor={htmlFor}
        className="block text-[var(--text-base)] font-medium text-[var(--color-ink)]"
      >
        {label}
      </label>
      {hint ? (
        <p className="text-[var(--text-base)] text-[var(--color-ink-muted)]">{hint}</p>
      ) : null}
      {children}
      {error ? <FieldError message={error} /> : null}
    </div>
  );
}

function FieldError({ message }: { message: string }) {
  return (
    <p role="alert" className="text-[var(--text-base)] text-[oklch(55%_0.18_25)]">
      {message}
    </p>
  );
}
