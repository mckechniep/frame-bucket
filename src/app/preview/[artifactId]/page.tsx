import { notFound } from 'next/navigation';
import Link from 'next/link';
import { defaultArchiveStore } from '@/lib/generation/archive';

export default async function PreviewPage({ params }: { params: Promise<{ artifactId: string }> }) {
  const { artifactId } = await params;
  const archive = defaultArchiveStore();
  const record = await archive.read(artifactId);
  if (!record) notFound();

  const children = await archive.getChildren(artifactId);

  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 text-sm">
          <h1 className="text-[var(--text-lg)] font-medium">Preview</h1>
          <span className="font-mono text-[var(--color-ink-muted)]">{artifactId}</span>
          <span className="text-[var(--color-ink-muted)]">
            <span className="font-medium text-[var(--color-ink)]">{record.recipeSummary}</span>
            {' · round '}
            {record.iterationRound}/3
            {' · $'}
            {record.cost.toFixed(2)}
            {' · '}
            {record.modelId}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
          {record.parentArtifactId ? (
            <span>
              Parent:{' '}
              <Link
                href={`/preview/${record.parentArtifactId}`}
                className="font-mono text-[var(--color-accent)] underline hover:no-underline"
              >
                {record.parentArtifactId}
              </Link>
            </span>
          ) : (
            <span className="text-[var(--color-ink-muted)]">Original generation</span>
          )}
          {children.length > 0 && (
            <span>
              Iterations:{' '}
              {children.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ' · '}
                  <Link
                    href={`/preview/${c.id}`}
                    className="font-mono text-[var(--color-accent)] underline hover:no-underline"
                  >
                    round {c.iterationRound}
                  </Link>
                </span>
              ))}
            </span>
          )}
        </div>
      </header>
      {/*
        Sandboxed iframe per spec § 8.6: generated HTML must run isolated from
        the host origin so a malicious or buggy artifact cannot read cookies,
        access localStorage, or navigate the top frame. `allow-scripts` lets the
        artifact's own scripts run; without `allow-same-origin`, scripts inside
        the doc are treated as a unique opaque origin and can't reach back to us.
      */}
      <iframe
        title={`Generated artifact: ${artifactId}`}
        srcDoc={record.html}
        sandbox="allow-scripts"
        className="flex-1 border-0 bg-white"
      />
    </main>
  );
}
