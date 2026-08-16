// @vitest-environment jsdom

/**
 * Render tests for the redesigned UI.
 *
 * These exist because the previous round of UI work was verified only by a clean
 * build plus reading the code. A build proves the code compiles; it proves nothing
 * about what reaches the DOM. Everything asserted here is a claim that was
 * previously made on the basis of reasoning alone.
 *
 * The focus is the availability picker, because that was the reported defect: a time
 * range wrapping onto four lines inside a narrow column.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { MemoryRouter } from 'react-router-dom';

import { AvailabilityPicker } from './components/tutors/AvailabilityPicker';
import { Header } from './components/layout/Header';
import { AuthProvider } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { formatSlotRange, formatTime } from './lib/utils';
import type { AvailabilitySlot } from '../shared/domain/types';

afterEach(cleanup);

// A fixed "now" so slot bookability is deterministic.
const NOW = new Date('2026-08-17T09:00:00.000Z');

function slot(overrides: Partial<AvailabilitySlot> = {}): AvailabilitySlot {
  return {
    id: 'slot-1',
    tutorProfileId: 'tutor-1',
    tutorUserId: 'tutor-user-1',
    startAt: '2026-08-18T15:00:00.000Z',
    endAt: '2026-08-18T16:00:00.000Z',
    status: 'OPEN',
    sessionId: null,
    ...overrides,
  };
}

function useFixedClock() {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
}

describe('time formatting', () => {
  it('drops the leading zero from single-digit hours', () => {
    // "03:00 PM" was ~8% wider than "3:00 PM" for no extra information, and that
    // width was enough to force a wrap in a narrow column.
    const formatted = formatTime('2026-08-18T15:00:00.000Z');
    expect(formatted).not.toMatch(/^0\d:/);
  });

  it('joins a range with non-breaking spaces so it cannot split across lines', () => {
    const range = formatSlotRange(
      '2026-08-18T15:00:00.000Z',
      '2026-08-18T16:00:00.000Z',
    );
    // U+00A0 on both sides of the dash. This is the structural guarantee; the
    // whitespace-nowrap class asserted below is the belt to this braces.
    expect(range).toContain('\u00a0–\u00a0');
    expect(range).not.toMatch(/ – /);
  });
});

describe('AvailabilityPicker rendering', () => {
  it('renders each time range as a single unbreakable node', () => {
    useFixedClock();
    try {
      render(
        <AvailabilityPicker
          slots={[slot()]}
          selectedSlotId={null}
          onSelect={() => {}}
        />,
      );

      const expected = formatSlotRange(
        '2026-08-18T15:00:00.000Z',
        '2026-08-18T16:00:00.000Z',
      );

      // Testing Library's default normalizer collapses U+00A0 into a plain space,
      // which would defeat the very thing being asserted. Trim only, so the
      // non-breaking spaces survive the comparison.
      const timeNode = screen.getByText(expected, {
        normalizer: (text) => text.trim(),
      });
      expect(timeNode).toBeTruthy();

      // The whole range lives in ONE element; nothing can break it apart.
      expect(timeNode.textContent).toBe(expected);
      expect(timeNode.textContent).toContain('\u00a0');

      // The element carrying the time must forbid wrapping.
      expect(timeNode.className).toContain('whitespace-nowrap');
      // Tabular figures keep digits aligned down the list.
      expect(timeNode.className).toContain('tabular-nums');
      // And no leading zero on a single-digit hour.
      expect(timeNode.textContent).not.toMatch(/(^|\s)0\d:/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders one full-width row per slot, not a multi-column grid', () => {
    useFixedClock();
    try {
      render(
        <AvailabilityPicker
          slots={[
            slot({ id: 'a' }),
            slot({
              id: 'b',
              startAt: '2026-08-18T17:00:00.000Z',
              endAt: '2026-08-18T18:00:00.000Z',
            }),
          ]}
          selectedSlotId={null}
          onSelect={() => {}}
        />,
      );

      const rows = screen.getAllByRole('button');
      expect(rows).toHaveLength(2);

      for (const row of rows) {
        expect(row.className).toContain('w-full');
        // A grid of columns is what caused the original wrap; assert it is gone.
        expect(row.parentElement?.parentElement?.className ?? '').not.toContain(
          'grid-cols-2',
        );
      }
    } finally {
      vi.useRealTimers();
    }
  });

  it('groups slots under a heading per day', () => {
    useFixedClock();
    try {
      render(
        <AvailabilityPicker
          slots={[
            slot({ id: 'a' }),
            slot({
              id: 'b',
              startAt: '2026-08-19T15:00:00.000Z',
              endAt: '2026-08-19T16:00:00.000Z',
            }),
          ]}
          selectedSlotId={null}
          onSelect={() => {}}
        />,
      );

      // Two distinct days -> two group regions.
      const groups = screen.getAllByRole('region');
      expect(groups.length).toBeGreaterThanOrEqual(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('calls onSelect with the chosen slot', async () => {
    useFixedClock();
    try {
      const onSelect = vi.fn();
      // advanceTimers keeps user-event working under faked Date.
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });

      render(
        <AvailabilityPicker
          slots={[slot({ id: 'pick-me' })]}
          selectedSlotId={null}
          onSelect={onSelect}
        />,
      );

      await user.click(screen.getByRole('button'));

      expect(onSelect).toHaveBeenCalledTimes(1);
      expect(onSelect.mock.calls[0]![0].id).toBe('pick-me');
    } finally {
      vi.useRealTimers();
    }
  });

  it('marks the selected slot with aria-pressed and a visible label', () => {
    useFixedClock();
    try {
      render(
        <AvailabilityPicker
          slots={[slot({ id: 'chosen' })]}
          selectedSlotId="chosen"
          onSelect={() => {}}
        />,
      );

      const row = screen.getByRole('button');
      expect(row.getAttribute('aria-pressed')).toBe('true');
      // Selection is never colour-only.
      expect(within(row).getByText('Selected')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows Select on an unselected slot', () => {
    useFixedClock();
    try {
      render(
        <AvailabilityPicker
          slots={[slot()]}
          selectedSlotId={null}
          onSelect={() => {}}
        />,
      );
      expect(screen.getByText('Select')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never offers a past slot', () => {
    useFixedClock();
    try {
      render(
        <AvailabilityPicker
          slots={[
            slot({
              id: 'past',
              startAt: '2026-08-01T15:00:00.000Z',
              endAt: '2026-08-01T16:00:00.000Z',
            }),
          ]}
          selectedSlotId={null}
          onSelect={() => {}}
        />,
      );

      expect(screen.queryAllByRole('button')).toHaveLength(0);
      expect(screen.getByText(/no open times/i)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('never offers an already booked slot, and says so using the real count', () => {
    useFixedClock();
    try {
      render(
        <AvailabilityPicker
          slots={[slot({ id: 'taken', status: 'BOOKED' })]}
          selectedSlotId={null}
          onSelect={() => {}}
        />,
      );

      expect(screen.queryAllByRole('button')).toHaveLength(0);
      // Reports the genuine number rather than a vague message.
      expect(screen.getByText(/fully booked/i)).toBeTruthy();
      expect(screen.getByText(/1 slot/)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('disables rows when the picker is disabled', () => {
    useFixedClock();
    try {
      render(
        <AvailabilityPicker
          slots={[slot()]}
          selectedSlotId={null}
          onSelect={() => {}}
          disabled
        />,
      );
      expect(screen.getByRole('button')).toHaveProperty('disabled', true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('reports how many times are open', () => {
    useFixedClock();
    try {
      render(
        <AvailabilityPicker
          slots={[
            slot({ id: 'a' }),
            slot({
              id: 'b',
              startAt: '2026-08-18T17:00:00.000Z',
              endAt: '2026-08-18T18:00:00.000Z',
            }),
          ]}
          selectedSlotId={null}
          onSelect={() => {}}
        />,
      );
      expect(screen.getByText(/2 open times/i)).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

// ---------------------------------------------------------------------------
// Mobile navigation
// ---------------------------------------------------------------------------

describe('Header mobile sheet', () => {
  /**
   * Regression guard for a real defect.
   *
   * The <header> carries `backdrop-blur`. Per CSS spec, an element with a
   * backdrop-filter becomes the containing block for its position:fixed
   * descendants. While the sheet was rendered inside the header, its
   * `fixed inset-0` resolved against the header's 64px box instead of the viewport,
   * so the drawer was clipped to its own title bar and the navigation links were
   * invisible.
   *
   * Asserting the panel is NOT inside <header> is what stops that returning: it is
   * the structural property the fix depends on, and it cannot be checked by a build.
   */
  it('portals the open drawer outside the blurred header', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToastProvider>
          <AuthProvider>
            <Header />
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /open menu/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Menu' });
    const header = document.querySelector('header');

    expect(header).not.toBeNull();
    // The whole point: the panel must live outside the containing block.
    expect(header!.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it('shows the public navigation links once open', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToastProvider>
          <AuthProvider>
            <Header />
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /open menu/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Menu' });

    // These were the links the user could not see.
    expect(within(dialog).getByText('Find a tutor')).toBeTruthy();
    expect(within(dialog).getByText('Subjects')).toBeTruthy();
    expect(within(dialog).getByText('How it works')).toBeTruthy();
  });

  it('closes on Escape', async () => {
    const user = userEvent.setup();

    render(
      <MemoryRouter>
        <ToastProvider>
          <AuthProvider>
            <Header />
          </AuthProvider>
        </ToastProvider>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: /open menu/i }));
    await screen.findByRole('dialog', { name: 'Menu' });

    await user.keyboard('{Escape}');

    expect(screen.queryByRole('dialog', { name: 'Menu' })).toBeNull();
  });
});
