import { slugify } from '@/lib/utils/slugify';
import type { Bucket, TaxonomyEntry } from '@/lib/types';

type NotionPage = {
  id: string;
  properties: Record<string, unknown>;
};

function getPlainText(prop: unknown): string {
  if (!prop || typeof prop !== 'object') return '';
  const p = prop as {
    type?: string;
    title?: Array<{ plain_text: string }>;
    rich_text?: Array<{ plain_text: string }>;
  };
  if (p.type === 'title' && Array.isArray(p.title)) {
    return p.title
      .map((x) => x.plain_text)
      .join('')
      .trim();
  }
  if (p.type === 'rich_text' && Array.isArray(p.rich_text)) {
    return p.rich_text
      .map((x) => x.plain_text)
      .join('')
      .trim();
  }
  return '';
}

function getMultiSelectOrCommaSplit(prop: unknown): string[] {
  if (!prop || typeof prop !== 'object') return [];
  const p = prop as {
    type?: string;
    multi_select?: Array<{ name: string }>;
    rich_text?: Array<{ plain_text: string }>;
  };
  if (p.type === 'multi_select' && Array.isArray(p.multi_select)) {
    return p.multi_select.map((x) => x.name.trim()).filter(Boolean);
  }
  const text = getPlainText(prop);
  if (!text) return [];
  return text
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export class MappingError extends Error {
  constructor(
    message: string,
    public readonly pageId: string,
    public readonly pageName: string,
  ) {
    super(message);
    this.name = 'MappingError';
  }
}

export function mapNotionPageToEntry(
  page: NotionPage,
  bucket: Bucket,
  hasOverride: boolean,
): TaxonomyEntry {
  const name = getPlainText(page.properties['Name']);
  if (!name) {
    throw new MappingError(`Missing "Name" for page ${page.id}`, page.id, '(unknown)');
  }
  const shortDefinition = getPlainText(page.properties['Short Definition']);
  if (!shortDefinition) {
    throw new MappingError(
      `Missing "Short Definition" for page ${name} (${page.id})`,
      page.id,
      name,
    );
  }
  const coreMood = getPlainText(page.properties['Core Mood']);
  if (!coreMood) {
    throw new MappingError(`Missing "Core Mood" for page ${name} (${page.id})`, page.id, name);
  }
  const bestUseCase = getPlainText(page.properties['Best Use Case']);
  if (!bestUseCase) {
    throw new MappingError(`Missing "Best Use Case" for page ${name} (${page.id})`, page.id, name);
  }
  const distinctiveSignals = getMultiSelectOrCommaSplit(page.properties['Distinctive Signals']);
  if (distinctiveSignals.length === 0) {
    throw new MappingError(
      `Missing "Distinctive Signals" for page ${name} (${page.id})`,
      page.id,
      name,
    );
  }
  const notes = getPlainText(page.properties['Notes']);
  return {
    id: slugify(name),
    bucket,
    name,
    shortDefinition,
    coreMood,
    bestUseCase,
    distinctiveSignals,
    notes,
    notionId: page.id,
    hasOverride,
  };
}
