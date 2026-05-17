import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const STATIC_DIR = path.join(process.cwd(), '.next', 'static');
const NEEDLE_NAME = 'SUPABASE_SERVICE_ROLE_KEY';
const needleValue = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function walk(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walk(full)));
    } else if (entry.isFile()) {
      // Skip source maps (.map) unless --include-maps passed
      if (full.endsWith('.map') && !process.argv.includes('--include-maps')) continue;
      files.push(full);
    }
  }
  return files;
}

async function main(): Promise<void> {
  let dirExists = false;
  try {
    const s = await stat(STATIC_DIR);
    dirExists = s.isDirectory();
  } catch {
    /* missing */
  }
  if (!dirExists) {
    console.error(`[check-no-key-leak] ${STATIC_DIR} does not exist. Run \`pnpm build\` first.`);
    process.exit(1);
  }

  const files = await walk(STATIC_DIR);
  const offenders: Array<{ file: string; what: string }> = [];

  for (const file of files) {
    const text = await readFile(file, 'utf-8');
    if (text.includes(NEEDLE_NAME)) {
      offenders.push({ file, what: `env var name "${NEEDLE_NAME}"` });
    }
    if (needleValue && text.includes(needleValue)) {
      offenders.push({ file, what: 'env var VALUE (the actual service-role key)' });
    }
  }

  if (offenders.length > 0) {
    console.error('[check-no-key-leak] LEAK DETECTED:');
    for (const o of offenders) {
      console.error(`  ${o.file}: ${o.what}`);
    }
    console.error(
      '\nRule 3 enforcement failed. The service role key must never appear in client bundles.',
    );
    process.exit(1);
  }

  console.log(`[check-no-key-leak] Scanned ${files.length} file(s) under .next/static/. Clean.`);
}

void main();
