// Re-export shim: the refine panel moved to the wizard during M4 Task 9 so
// both /generate-test and /wizard/generate render the same component. The
// `import { RefinePanel } from './_refine-panel'` paths in /generate-test
// continue to work via this file.

export { RefinePanel } from '@/app/wizard/_components/refine-panel';
