import {
  WizardAdvancedLinks,
  WizardProgressBar,
  WizardStartOver,
} from './_components/progress-bar';

export default function WizardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-svh flex flex-col bg-[var(--color-surface)] text-[var(--color-ink)]">
      <header className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-[var(--space-6)] px-[var(--space-8)] py-[var(--space-4)]">
          <div className="flex items-center gap-[var(--space-4)]">
            <span className="font-[family-name:var(--font-display)] text-[var(--text-lg)] tracking-tight">
              Frame Bucket
            </span>
            <span aria-hidden className="h-4 w-px bg-[var(--color-border)]" />
            <span className="text-[var(--text-base)] text-[var(--color-ink-muted)]">Wizard</span>
          </div>
          <WizardProgressBar />
          <WizardStartOver />
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-[var(--color-border)]">
        <div className="mx-auto max-w-[1400px] px-[var(--space-8)] py-[var(--space-4)]">
          <WizardAdvancedLinks />
        </div>
      </footer>
    </div>
  );
}
