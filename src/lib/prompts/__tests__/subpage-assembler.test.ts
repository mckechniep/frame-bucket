import { describe, it, expect, vi } from 'vitest';
import { assembleSubpageRequest, outlineHtml } from '../subpage-assembler';
import type { NavPage } from '@/lib/sites/nav-injector';

vi.mock('../loader', () => ({
  loadPosture: vi.fn().mockResolvedValue('POSTURE CONTENT'),
  loadBaseCanon: vi.fn().mockResolvedValue('BASE CANON CONTENT'),
  loadOutputContract: vi.fn().mockResolvedValue('OUTPUT CONTRACT CONTENT'),
  loadAestheticOverride: vi.fn().mockResolvedValue(null),
}));

// The expected invariant block text — byte-identical to assembler.ts's block[1].
// Rule 8: this exact string must be shared across generation + subpage calls.
const EXPECTED_INVARIANT_BLOCK_TEXT =
  '## Frontend Design Posture\n\nPOSTURE CONTENT\n\n## Craft Canon\n\nBASE CANON CONTENT\n\n## Generation Output Contract\n\nOUTPUT CONTRACT CONTENT';

const baseNav: NavPage[] = [
  { slug: '/', title: 'Home', position: 0 },
  { slug: '/about', title: 'About', position: 1 },
  { slug: '/services', title: 'Services', position: 2 },
];

const baseReq = {
  contractMd: '# Design Contract\n\n- Primary color: #1a1a2e\n- Font: IBM Plex Serif',
  pageBrief: 'A page showcasing our services with a grid of cards.',
  pageTitle: 'Services',
  pageSlug: '/services',
  navManifest: baseNav,
  landingStructure: '<h1>Home</h1><h2>Hero</h2><section></section>',
};

describe('assembleSubpageRequest — system blocks', () => {
  it('block[0] contains a role sentence about adding to an existing website', async () => {
    const req = await assembleSubpageRequest(baseReq);
    expect(req.system[0]?.text.toLowerCase()).toContain('existing website');
    expect(req.system[0]?.text).toContain('senior frontend designer');
  });

  it('block[0] does NOT have cache_control', async () => {
    const req = await assembleSubpageRequest(baseReq);
    expect(req.system[0]?.cache_control).toBeUndefined();
  });

  it('block[1] text is byte-identical to assembler.ts invariant block format (Rule 8)', async () => {
    const req = await assembleSubpageRequest(baseReq);
    expect(req.system[1]?.text).toBe(EXPECTED_INVARIANT_BLOCK_TEXT);
  });

  it('block[1] has cache_control ephemeral', async () => {
    const req = await assembleSubpageRequest(baseReq);
    expect(req.system[1]?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('block[2] contains the contractMd verbatim under ## Design Contract', async () => {
    const req = await assembleSubpageRequest(baseReq);
    expect(req.system[2]?.text).toContain('## Design Contract');
    expect(req.system[2]?.text).toContain(baseReq.contractMd);
  });

  it('block[2] has cache_control ephemeral', async () => {
    const req = await assembleSubpageRequest(baseReq);
    expect(req.system[2]?.cache_control).toEqual({ type: 'ephemeral' });
  });

  it('has exactly 3 system blocks total', async () => {
    const req = await assembleSubpageRequest(baseReq);
    expect(req.system).toHaveLength(3);
  });

  it('has exactly 2 ephemeral cache_control blocks', async () => {
    const req = await assembleSubpageRequest(baseReq);
    const cached = req.system.filter((b) => b.cache_control?.type === 'ephemeral');
    expect(cached).toHaveLength(2);
  });
});

describe('assembleSubpageRequest — user content', () => {
  it('contains pageTitle and pageSlug', async () => {
    const req = await assembleSubpageRequest(baseReq);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain('Services');
    expect(content).toContain('/services');
  });

  it('contains the page brief', async () => {
    const req = await assembleSubpageRequest(baseReq);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain(baseReq.pageBrief);
  });

  it('contains all nav manifest pages listed by title and slug', async () => {
    const req = await assembleSubpageRequest(baseReq);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain('Home');
    expect(content).toContain('/');
    expect(content).toContain('About');
    expect(content).toContain('/about');
    expect(content).toContain('Services');
    expect(content).toContain('/services');
  });

  it('nav pages appear in position order', async () => {
    const shuffled: NavPage[] = [
      { slug: '/services', title: 'Services', position: 2 },
      { slug: '/', title: 'Home', position: 0 },
      { slug: '/about', title: 'About', position: 1 },
    ];
    const req = await assembleSubpageRequest({ ...baseReq, navManifest: shuffled });
    const content = req.messages[0]?.content ?? '';
    const homeIdx = content.indexOf('Home (/)');
    const aboutIdx = content.indexOf('About (/about)');
    const servicesIdx = content.indexOf('Services (/services)');
    expect(homeIdx).toBeLessThan(aboutIdx);
    expect(aboutIdx).toBeLessThan(servicesIdx);
  });

  it('contains landingStructure', async () => {
    const req = await assembleSubpageRequest(baseReq);
    const content = req.messages[0]?.content ?? '';
    // landingStructure is passed through outlineHtml — check for H1/H2 or section count
    expect(content).toContain('H1:');
  });

  it('contains fb:nav-links:start marker', async () => {
    const req = await assembleSubpageRequest(baseReq);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain('fb:nav-links:start');
  });

  it('contains fb:nav-links:end marker', async () => {
    const req = await assembleSubpageRequest(baseReq);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain('fb:nav-links:end');
  });

  it('nav-marker directive is in user content, not any system block', async () => {
    const req = await assembleSubpageRequest(baseReq);
    for (const block of req.system) {
      expect(block.text).not.toContain('fb:nav-links');
    }
    expect(req.messages[0]?.content ?? '').toContain('fb:nav-links');
  });

  it('contains output discipline line', async () => {
    const req = await assembleSubpageRequest(baseReq);
    const content = req.messages[0]?.content ?? '';
    expect(content).toContain('Output ONLY');
  });
});

describe('assembleSubpageRequest — model / stream', () => {
  it('uses claude-opus-4-7 model', async () => {
    const req = await assembleSubpageRequest(baseReq);
    expect(req.model).toBe('claude-opus-4-7');
  });

  it('uses max_tokens 32000', async () => {
    const req = await assembleSubpageRequest(baseReq);
    expect(req.max_tokens).toBe(32000);
  });

  it('has stream: true', async () => {
    const req = await assembleSubpageRequest(baseReq);
    expect(req.stream).toBe(true);
  });
});

describe('outlineHtml', () => {
  it('extracts h1, h2, h3 text in document order', () => {
    const html = `
      <h1>SmokeYard — AI Design Studio</h1>
      <h2>Services</h2>
      <h2>Pricing</h2>
      <h3>Starter</h3>
      <section></section>
      <section></section>
    `;
    const result = outlineHtml(html);
    expect(result).toContain('H1: SmokeYard — AI Design Studio');
    expect(result).toContain('H2: Services');
    expect(result).toContain('H2: Pricing');
    expect(result).toContain('H3: Starter');
    const h1Idx = result.indexOf('H1:');
    const h2Idx = result.indexOf('H2:');
    const h3Idx = result.indexOf('H3:');
    expect(h1Idx).toBeLessThan(h2Idx);
    expect(h2Idx).toBeLessThan(h3Idx);
  });

  it('includes section count in output', () => {
    const html = `
      <h1>Title</h1>
      <section></section>
      <section></section>
      <section></section>
    `;
    const result = outlineHtml(html);
    expect(result).toContain('(3 sections)');
  });

  it('handles zero sections', () => {
    const html = '<h1>Title</h1>';
    const result = outlineHtml(html);
    expect(result).toContain('(0 sections)');
  });

  it('returns (no headings found) with section count for empty input', () => {
    const result = outlineHtml('');
    expect(result).toContain('(no headings found)');
    expect(result).toContain('(0 sections)');
  });

  it('returns (no headings found) with section count for content with no headings', () => {
    const html = '<p>Just a paragraph</p><section></section>';
    const result = outlineHtml(html);
    expect(result).toContain('(no headings found)');
    expect(result).toContain('(1 sections)');
  });

  it('caps output at 500 chars with ellipsis', () => {
    const many = Array.from(
      { length: 100 },
      (_, i) => `<h2>Section ${i} with a long title here</h2>`,
    ).join('');
    const result = outlineHtml(many);
    expect(result.length).toBeLessThanOrEqual(500);
    expect(result.endsWith('…')).toBe(true);
  });

  it('never throws on malformed HTML', () => {
    expect(() => outlineHtml('<h1>Unclosed')).not.toThrow();
    expect(() => outlineHtml('<<<<<')).not.toThrow();
    expect(() => outlineHtml(null as unknown as string)).not.toThrow();
  });

  it('ignores h4 and deeper headings', () => {
    const html = '<h1>Title</h1><h4>Deep</h4>';
    const result = outlineHtml(html);
    expect(result).not.toContain('H4:');
    expect(result).toContain('H1: Title');
  });
});
