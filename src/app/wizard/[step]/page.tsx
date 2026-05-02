export default async function WizardStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;

  return (
    <main className="p-8">
      <h1 className="text-[var(--text-2xl)]">Wizard: {step}</h1>
      <p className="mt-4 text-[var(--color-ink-muted)]">Stub for the M4 wizard flow.</p>
    </main>
  );
}
