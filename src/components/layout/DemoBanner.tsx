/**
 * AC-43.
 *
 * Demo mode must be impossible to mistake for production persistence. This banner
 * is permanent and not dismissible: a dismissible label would be dismissed in the
 * first minute and the rest of the review would proceed under a false assumption.
 */

import { IS_DEMO_MODE } from '../../lib/config';
import { InfoIcon } from '../ui/icons';

export function DemoBanner() {
  if (!IS_DEMO_MODE) return null;

  return (
    <div className="border-b border-amber-300 bg-amber-50 text-amber-950">
      <div className="container-page flex items-start gap-2.5 py-2">
        <span className="mt-0.5 shrink-0 text-base" aria-hidden="true">
          <InfoIcon />
        </span>
        {/*
          Kept deliberately short. The banner is permanent and non-dismissible by
          design, so every line it occupies is stolen from the top of every page on a
          small screen. This states the same three things (demo, local to this
          device, connect AWS for real persistence) in roughly half the height.
        */}
        <p className="text-sm">
          <span className="font-semibold">Demo data.</span> Accounts and bookings are
          stored only in this browser. Connect the AWS backend for real, multi-user
          persistence.
        </p>
      </div>
    </div>
  );
}
