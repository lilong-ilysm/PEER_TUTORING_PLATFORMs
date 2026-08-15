import type { TutorSearchFilters } from '../../../shared/domain/types';
import {
  LEVEL_LABELS,
  LEVEL_ORDER,
  MODE_LABELS,
  MODE_ORDER,
  SUBJECTS,
  WEEKDAY_LABELS,
} from '../../../shared/domain/subjects';
import { Input, Select } from '../ui/Field';
import { Button } from '../ui/Button';
import { SearchIcon } from '../ui/icons';

export interface TutorFiltersProps {
  filters: TutorSearchFilters;
  onChange: (next: Partial<TutorSearchFilters>) => void;
  onClear: () => void;
  activeCount: number;
}

const RATE_OPTIONS = [
  { value: '10', label: 'Up to £10/hr' },
  { value: '15', label: 'Up to £15/hr' },
  { value: '20', label: 'Up to £20/hr' },
  { value: '30', label: 'Up to £30/hr' },
  { value: '50', label: 'Up to £50/hr' },
];

const RATING_OPTIONS = [
  { value: '3', label: '3 stars and up' },
  { value: '4', label: '4 stars and up' },
  { value: '4.5', label: '4.5 stars and up' },
];

/**
 * The filter controls, shared by the desktop rail and the mobile sheet so the two
 * can never drift apart.
 */
export function TutorFilterFields({ filters, onChange, onClear, activeCount }: TutorFiltersProps) {
  return (
    <div className="space-y-4">
      <Input
        label="Search"
        labelHidden
        type="search"
        placeholder="Name, subject or keyword"
        value={filters.q ?? ''}
        onChange={(event) => onChange({ q: event.target.value, page: 1 })}
        leadingIcon={<SearchIcon />}
      />

      <Select
        label="Subject"
        placeholder="Any subject"
        value={filters.subjectId ?? ''}
        onChange={(event) => onChange({ subjectId: event.target.value || undefined, page: 1 })}
        options={SUBJECTS.map((subject) => ({ value: subject.id, label: subject.name }))}
      />

      <Select
        label="Level"
        placeholder="Any level"
        value={filters.level ?? ''}
        onChange={(event) =>
          onChange({
            level: (event.target.value || undefined) as TutorSearchFilters['level'],
            page: 1,
          })
        }
        options={LEVEL_ORDER.map((level) => ({ value: level, label: LEVEL_LABELS[level] }))}
      />

      <Select
        label="Session type"
        placeholder="Online or in person"
        value={filters.mode ?? ''}
        onChange={(event) =>
          onChange({
            mode: (event.target.value || undefined) as TutorSearchFilters['mode'],
            page: 1,
          })
        }
        options={MODE_ORDER.filter((mode) => mode !== 'EITHER').map((mode) => ({
          value: mode,
          label: MODE_LABELS[mode],
        }))}
      />

      <Select
        label="Minimum rating"
        placeholder="Any rating"
        hint="Tutors with no reviews yet are not shown when this is set."
        value={filters.minRating !== undefined ? String(filters.minRating) : ''}
        onChange={(event) =>
          onChange({
            minRating: event.target.value ? Number(event.target.value) : undefined,
            page: 1,
          })
        }
        options={RATING_OPTIONS}
      />

      <Select
        label="Maximum rate"
        placeholder="Any rate"
        value={filters.maxRate !== undefined ? String(filters.maxRate) : ''}
        onChange={(event) =>
          onChange({
            maxRate: event.target.value ? Number(event.target.value) : undefined,
            page: 1,
          })
        }
        options={RATE_OPTIONS}
      />

      <Select
        label="Free on"
        placeholder="Any day"
        value={filters.weekday !== undefined ? String(filters.weekday) : ''}
        onChange={(event) =>
          onChange({
            weekday: event.target.value ? Number(event.target.value) : undefined,
            page: 1,
          })
        }
        options={WEEKDAY_LABELS.map((label, index) => ({ value: String(index), label }))}
      />

      {activeCount > 0 ? (
        <Button variant="secondary" fullWidth onClick={onClear}>
          Clear {activeCount} {activeCount === 1 ? 'filter' : 'filters'}
        </Button>
      ) : null}
    </div>
  );
}

export const SORT_OPTIONS = [
  { value: 'RATING_DESC', label: 'Highest rated' },
  { value: 'SOONEST', label: 'Available soonest' },
  { value: 'RATE_ASC', label: 'Lowest rate' },
  { value: 'RATE_DESC', label: 'Highest rate' },
  { value: 'REVIEWS_DESC', label: 'Most reviewed' },
];
