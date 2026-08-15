/**
 * Form primitives.
 *
 * Every control is wrapped by `Field`, which owns the label association and the
 * error wiring. Doing it here rather than at each call site is what makes AC-35
 * (programmatic labels, announced errors) hold everywhere instead of mostly.
 */

import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

const CONTROL =
  'block w-full rounded-lg border bg-white px-3 text-base text-ink-900 placeholder:text-ink-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-primary-600 focus:ring-offset-1 ' +
  'disabled:bg-ink-100 disabled:text-ink-500';

const CONTROL_OK = 'border-ink-300';
const CONTROL_ERROR = 'border-rose-500 focus:ring-rose-600';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Hides the label visually while keeping it available to screen readers. */
  labelHidden?: boolean;
  children: (ids: { controlId: string; describedBy: string | undefined }) => ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required,
  labelHidden,
  children,
}: FieldShellProps) {
  const controlId = useId();
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null]
    .filter(Boolean)
    .join(' ') || undefined;

  return (
    <div className="w-full">
      <label
        htmlFor={controlId}
        className={cn(
          'mb-1.5 block text-sm font-medium text-ink-700',
          labelHidden && 'sr-only',
        )}
      >
        {label}
        {required ? (
          <span className="ml-1 text-rose-600" aria-hidden="true">
            *
          </span>
        ) : null}
      </label>

      {hint ? (
        <p id={hintId} className="mb-1.5 text-sm text-ink-500">
          {hint}
        </p>
      ) : null}

      {children({ controlId, describedBy })}

      {error ? (
        // role="alert" so the message is announced when it appears.
        <p id={errorId} role="alert" className="mt-1.5 text-sm font-medium text-rose-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------

export interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  labelHidden?: boolean;
  leadingIcon?: ReactNode;
}

export function Input({
  label,
  hint,
  error,
  labelHidden,
  leadingIcon,
  className,
  required,
  ...props
}: InputProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      labelHidden={labelHidden}
    >
      {({ controlId, describedBy }) => (
        <div className="relative">
          {leadingIcon ? (
            <span
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-ink-400"
              aria-hidden="true"
            >
              {leadingIcon}
            </span>
          ) : null}
          <input
            id={controlId}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            required={required}
            className={cn(
              CONTROL,
              error ? CONTROL_ERROR : CONTROL_OK,
              'h-11',
              Boolean(leadingIcon) && 'pl-10',
              className,
            )}
            {...props}
          />
        </div>
      )}
    </Field>
  );
}

// ---------------------------------------------------------------------------

export interface TextareaProps
  extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  /** Shows a live character counter; required by AC-30 for message limits. */
  maxLength?: number;
  showCounter?: boolean;
}

export function Textarea({
  label,
  hint,
  error,
  maxLength,
  showCounter = true,
  className,
  required,
  value,
  ...props
}: TextareaProps) {
  const length = typeof value === 'string' ? value.length : 0;
  const nearLimit = maxLength ? length > maxLength * 0.9 : false;

  return (
    <Field label={label} hint={hint} error={error} required={required}>
      {({ controlId, describedBy }) => (
        <>
          <textarea
            id={controlId}
            aria-describedby={describedBy}
            aria-invalid={error ? true : undefined}
            required={required}
            maxLength={maxLength}
            value={value}
            className={cn(
              CONTROL,
              error ? CONTROL_ERROR : CONTROL_OK,
              'min-h-[7rem] py-2.5 leading-relaxed',
              className,
            )}
            {...props}
          />
          {maxLength && showCounter ? (
            <p
              className={cn(
                'mt-1 text-right text-xs',
                nearLimit ? 'text-amber-700' : 'text-ink-500',
              )}
              aria-live="polite"
            >
              {length} / {maxLength}
            </p>
          ) : null}
        </>
      )}
    </Field>
  );
}

// ---------------------------------------------------------------------------

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  labelHidden?: boolean;
  options: SelectOption[];
  placeholder?: string;
}

export function Select({
  label,
  hint,
  error,
  labelHidden,
  options,
  placeholder,
  className,
  required,
  ...props
}: SelectProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      labelHidden={labelHidden}
    >
      {({ controlId, describedBy }) => (
        <select
          id={controlId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          required={required}
          className={cn(
            CONTROL,
            error ? CONTROL_ERROR : CONTROL_OK,
            'h-11 appearance-none bg-[length:1rem] bg-[right_0.75rem_center] bg-no-repeat pr-9',
            className,
          )}
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%236b7680' stroke-width='2' stroke-linecap='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
          }}
          {...props}
        >
          {placeholder ? <option value="">{placeholder}</option> : null}
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

// ---------------------------------------------------------------------------

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: ReactNode;
  description?: string;
}

export function Checkbox({ label, description, className, ...props }: CheckboxProps) {
  const id = useId();
  const descriptionId = `${id}-description`;

  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        aria-describedby={description ? descriptionId : undefined}
        className={cn(
          'mt-0.5 h-5 w-5 shrink-0 rounded border-ink-300 text-primary-600',
          'focus:ring-2 focus:ring-primary-600 focus:ring-offset-1',
          className,
        )}
        {...props}
      />
      <div className="min-w-0">
        <label htmlFor={id} className="block text-base text-ink-800">
          {label}
        </label>
        {description ? (
          <p id={descriptionId} className="text-sm text-ink-500">
            {description}
          </p>
        ) : null}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export interface ToggleChipProps {
  selected: boolean;
  onToggle: () => void;
  children: ReactNode;
  /** Rendered as a real checkbox so the group is keyboard and SR accessible. */
  name?: string;
}

/** A multi-select chip. Used for subjects and levels. */
export function ToggleChip({ selected, onToggle, children, name }: ToggleChipProps) {
  return (
    <label
      className={cn(
        'inline-flex cursor-pointer select-none items-center gap-2 rounded-full border px-3 py-2 text-sm',
        'transition-colors focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-1',
        selected
          ? 'border-primary-600 bg-primary-50 font-medium text-primary-800'
          : 'border-ink-300 bg-white text-ink-700 hover:bg-ink-50',
      )}
    >
      <input
        type="checkbox"
        name={name}
        checked={selected}
        onChange={onToggle}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'flex h-4 w-4 items-center justify-center rounded-sm border text-[10px]',
          selected ? 'border-primary-600 bg-primary-600 text-white' : 'border-ink-400',
        )}
      >
        {selected ? '✓' : ''}
      </span>
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------

export interface RadioCardOption<T extends string> {
  value: T;
  title: string;
  description?: string;
}

export interface RadioCardGroupProps<T extends string> {
  legend: string;
  hint?: string;
  error?: string;
  name: string;
  value: T | null;
  options: RadioCardOption<T>[];
  onChange: (value: T) => void;
}

/** A fieldset of selectable cards. Used for the role choice on registration. */
export function RadioCardGroup<T extends string>({
  legend,
  hint,
  error,
  name,
  value,
  options,
  onChange,
}: RadioCardGroupProps<T>) {
  const id = useId();
  const errorId = `${id}-error`;

  return (
    <fieldset aria-describedby={error ? errorId : undefined}>
      <legend className="mb-1.5 text-sm font-medium text-ink-700">{legend}</legend>
      {hint ? <p className="mb-2 text-sm text-ink-500">{hint}</p> : null}

      <div className="grid gap-2 sm:grid-cols-3">
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              className={cn(
                'flex cursor-pointer flex-col gap-1 rounded-xl border p-3 transition-colors',
                'focus-within:ring-2 focus-within:ring-primary-600 focus-within:ring-offset-1',
                selected
                  ? 'border-primary-600 bg-primary-50'
                  : 'border-ink-300 bg-white hover:bg-ink-50',
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name={name}
                  value={option.value}
                  checked={selected}
                  onChange={() => onChange(option.value)}
                  className="h-4 w-4 border-ink-300 text-primary-600 focus:ring-0"
                />
                <span
                  className={cn(
                    'text-sm font-semibold',
                    selected ? 'text-primary-900' : 'text-ink-800',
                  )}
                >
                  {option.title}
                </span>
              </span>
              {option.description ? (
                <span className="pl-6 text-sm text-ink-600">{option.description}</span>
              ) : null}
            </label>
          );
        })}
      </div>

      {error ? (
        <p id={errorId} role="alert" className="mt-1.5 text-sm font-medium text-rose-700">
          {error}
        </p>
      ) : null}
    </fieldset>
  );
}
