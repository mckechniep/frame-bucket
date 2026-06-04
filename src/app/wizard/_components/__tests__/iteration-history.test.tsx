// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { useWizardStore, type WizardRound } from '@/lib/wizard/store';

import { IterationHistory } from '../iteration-history';

const round = (over: Partial<WizardRound> & Pick<WizardRound, 'artifactId'>): WizardRound => ({
  parentArtifactId: null,
  iterationRound: 0,
  recipeSummary: 'r',
  cost: 0,
  generatedAt: '2026-06-04T00:00:00.000Z',
  ...over,
});

afterEach(() => {
  cleanup();
  useWizardStore.getState().reset();
});

describe('IterationHistory — subpage cost is surfaced', () => {
  // Regression guard: subpages used to be stored only as `pages` (never as
  // rounds), so their ~$2 generation cost never reached the History panel.
  // They are now the "Original" round of their own per-page chain.
  it('shows the active subpage as its own Original round with its real cost', () => {
    const landingId = 'landing-1';
    const subpageId = 'subpage-team';
    useWizardStore.setState({
      rounds: [
        round({ artifactId: landingId, recipeSummary: 'Home', cost: 2.63 }),
        round({ artifactId: subpageId, recipeSummary: 'Team', cost: 2.022939 }),
      ],
      pages: [
        { slug: '/', title: 'Home', artifactId: landingId, position: 0 },
        { slug: '/team', title: 'Team', artifactId: subpageId, position: 1 },
      ],
      siteId: 'site-x',
      activeSlug: '/team',
      activeArtifactId: subpageId,
    });

    render(<IterationHistory />);

    // The subpage's own cost is visible…
    expect(screen.getByText(/\$2\.023/)).toBeTruthy();
    // …and per-page isolation holds: the landing's cost is NOT shown while
    // viewing the subpage (roundsForPage returns only the subpage's chain).
    expect(screen.queryByText(/\$2\.630/)).toBeNull();
    // Exactly one "Original" entry (the subpage), not the landing's too.
    expect(screen.getAllByText('Original')).toHaveLength(1);
  });

  it('isolates to the landing chain when the landing is active', () => {
    const landingId = 'landing-1';
    const iterId = 'landing-iter-1';
    const subpageId = 'subpage-team';
    useWizardStore.setState({
      rounds: [
        round({ artifactId: landingId, cost: 2.63 }),
        round({ artifactId: iterId, parentArtifactId: landingId, iterationRound: 1, cost: 0.9 }),
        round({ artifactId: subpageId, cost: 2.02 }),
      ],
      pages: [
        { slug: '/', title: 'Home', artifactId: iterId, position: 0 },
        { slug: '/team', title: 'Team', artifactId: subpageId, position: 1 },
      ],
      siteId: 'site-x',
      activeSlug: '/',
      activeArtifactId: iterId,
    });

    render(<IterationHistory />);

    // Landing chain shows both its rounds…
    expect(screen.getByText(/\$2\.630/)).toBeTruthy();
    expect(screen.getByText(/\$0\.900/)).toBeTruthy();
    // …and not the subpage's.
    expect(screen.queryByText(/\$2\.020/)).toBeNull();
  });
});
