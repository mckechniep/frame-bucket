import { redirect } from 'next/navigation';

import { defaultFileStore } from '@/lib/taxonomy/file-store';
import { STEPS, type Step } from '@/lib/wizard/steps';

import { WizardStepShell } from '../_components/wizard-step-shell';

export default async function WizardStepPage({ params }: { params: Promise<{ step: string }> }) {
  const { step } = await params;

  if (!STEPS.includes(step as Step)) {
    redirect('/wizard/brief');
  }

  // Taxonomy is loaded server-side and handed to the client shell. The
  // recommend step needs the full taxonomy for its "override" affordance;
  // the brief and generate steps ignore it. Reading the file store on every
  // wizard navigation is cheap (a single JSON read) and keeps the client
  // free of a /api/taxonomy fetch on each step transition.
  const taxonomy = await defaultFileStore().get();

  return <WizardStepShell step={step as Step} taxonomy={taxonomy} />;
}
