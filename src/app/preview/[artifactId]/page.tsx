export default async function PreviewPage({ params }: { params: Promise<{ artifactId: string }> }) {
  const { artifactId } = await params;

  return (
    <main className="p-8">
      <h1 className="text-[var(--text-2xl)]">Preview</h1>
      <p className="mt-4 text-[var(--color-ink-muted)]">Artifact: {artifactId}</p>
    </main>
  );
}
