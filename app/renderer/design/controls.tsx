import { ChevronDown, type LucideIcon, Minus, Plus } from 'lucide-react'
import { motion } from 'motion/react'
import {
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  forwardRef,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { cx } from './cx'
import { snappy } from './motion'
import { Spinner } from './spinner'

// -------------------------------------------------------------------- Button

export type ButtonVariant = 'primary' | 'secondary' | 'plain' | 'destructive'
export type ButtonSize = 'small' | 'regular' | 'large'

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: LucideIcon
  loading?: boolean
  fullWidth?: boolean
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'regular',
    icon: Icon,
    loading = false,
    fullWidth,
    className,
    children,
    disabled,
    type = 'button',
    ...rest
  },
  ref,
) {
  const iconSize = size === 'small' ? 14 : size === 'large' ? 18 : 16
  return (
    <button
      ref={ref}
      type={type}
      className={cx(
        'atl-button',
        `atl-button--${variant}`,
        `atl-button--${size}`,
        fullWidth && 'atl-button--full',
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Spinner size={iconSize} /> : Icon ? <Icon aria-hidden size={iconSize} strokeWidth={1.75} /> : null}
      {children !== undefined && <span>{children}</span>}
    </button>
  )
})

// ---------------------------------------------------------- SegmentedControl

export interface SegmentOption<T extends string> {
  value: T
  label: string
  icon?: LucideIcon
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[]
  value: T
  onChange: (value: T) => void
  label: string
}

export function SegmentedControl<T extends string>({ options, value, onChange, label }: SegmentedControlProps<T>) {
  const group = useId()
  const refs = useRef<Array<HTMLButtonElement | null>>([])
  const index = Math.max(
    0,
    options.findIndex((o) => o.value === value),
  )

  function move(event: KeyboardEvent<HTMLButtonElement>, from: number): void {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key]
    let next: number | null = step === undefined ? null : (from + step + options.length) % options.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = options.length - 1
    if (next === null) return
    event.preventDefault()
    const option = options[next]
    if (option) onChange(option.value)
    refs.current[next]?.focus()
  }

  return (
    <div className="atl-segmented" role="radiogroup" aria-label={label}>
      {options.map((option, i) => {
        const selected = i === index
        const Icon = option.icon
        return (
          <button
            key={option.value}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            className="atl-segment"
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => move(event, i)}
          >
            {selected && <motion.span layoutId={`seg-${group}`} className="atl-segment-thumb" transition={snappy} />}
            <span className="atl-segment-label">
              {Icon && <Icon aria-hidden size={14} strokeWidth={1.75} />}
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// -------------------------------------------------------------------- Toggle

export interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
  description?: string
  disabled?: boolean
}

export function Toggle({ checked, onChange, label, description, disabled }: ToggleProps) {
  const id = useId()
  return (
    <div className="atl-toggle-row">
      <span className="atl-toggle-text">
        <span id={`${id}-label`} className="atl-callout">
          {label}
        </span>
        {description && (
          <span id={`${id}-desc`} className="atl-footnote atl-secondary">
            {description}
          </span>
        )}
      </span>
      <button
        type="button"
        role="switch"
        className="atl-toggle"
        aria-checked={checked}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-desc` : undefined}
        disabled={disabled}
        onClick={() => onChange(!checked)}
      >
        <motion.span
          className="atl-toggle-knob"
          animate={{ x: checked ? 16 : 0 }}
          transition={snappy}
          initial={false}
        />
      </button>
    </div>
  )
}

// -------------------------------------------------------------------- Slider

export interface SliderProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label: string
  ticks?: number[]
  format?: (value: number) => string
  hideLabel?: boolean
}

export function Slider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  label,
  ticks,
  format = String,
  hideLabel,
}: SliderProps) {
  const id = useId()
  const pct = max > min ? ((value - min) / (max - min)) * 100 : 0
  const at = (v: number): string => `calc(10px + (100% - 20px) * ${(v - min) / (max - min)})`
  return (
    <div className="atl-slider">
      <div className={cx('atl-slider-head', hideLabel && 'atl-visually-hidden')}>
        <label htmlFor={id} className="atl-field-label">
          {label}
        </label>
        <span className="atl-callout atl-tabular" aria-hidden>
          {format(value)}
        </span>
      </div>
      <div className="atl-slider-track">
        <span className="atl-slider-bubble" style={{ left: at(value) }} aria-hidden>
          {format(value)}
        </span>
        <input
          id={id}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-valuetext={format(value)}
          style={{ ['--pct' as string]: `${pct}%` }}
          onChange={(event) => onChange(Number(event.target.value))}
        />
      </div>
      {ticks && (
        <div className="atl-slider-ticks" aria-hidden>
          {ticks.map((tick) => (
            <span key={tick} className="atl-slider-tick" style={{ left: at(tick) }}>
              {format(tick)}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

// ------------------------------------------------------------------- Stepper

export interface StepperProps {
  value: number
  onChange: (value: number) => void
  min?: number
  max?: number
  step?: number
  label: string
  disabled?: boolean
}

function decimalsOf(step: number): number {
  const text = String(step)
  return text.includes('.') ? (text.split('.')[1]?.length ?? 0) : 0
}

export function Stepper({ value, onChange, min = 0, max = 100, step = 1, label, disabled }: StepperProps) {
  const decimals = decimalsOf(step)
  const show = (v: number): string => v.toFixed(decimals)
  const [draft, setDraft] = useState(show(value))
  useEffect(() => setDraft(value.toFixed(decimals)), [value, decimals])

  const clamp = (v: number): number => Math.min(max, Math.max(min, Number(v.toFixed(decimals))))
  const set = (v: number): void => {
    const next = clamp(v)
    setDraft(show(next))
    if (next !== value) onChange(next)
  }
  const commit = (): void => {
    const parsed = Number(draft.replace(',', '.'))
    if (Number.isFinite(parsed)) set(parsed)
    else setDraft(show(value))
  }

  return (
    <div className="atl-stepper" role="group" aria-label={label}>
      <button
        type="button"
        aria-label={`Decrease ${label}`}
        disabled={disabled || value <= min}
        onClick={() => set(value - step)}
      >
        <Minus aria-hidden size={14} strokeWidth={2} />
      </button>
      <input
        role="spinbutton"
        aria-label={label}
        aria-valuemin={min}
        aria-valuemax={max}
        aria-valuenow={value}
        inputMode="decimal"
        value={draft}
        disabled={disabled}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'ArrowUp') {
            event.preventDefault()
            set(value + step)
          } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            set(value - step)
          } else if (event.key === 'Enter') {
            commit()
          }
        }}
      />
      <button
        type="button"
        aria-label={`Increase ${label}`}
        disabled={disabled || value >= max}
        onClick={() => set(value + step)}
      >
        <Plus aria-hidden size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

// ----------------------------------------------------- TextField / TextArea

interface FieldShell {
  label: string
  hint?: ReactNode
  error?: string
  hideLabel?: boolean
}

export interface TextFieldProps extends FieldShell {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  maxLength?: number
  autoFocus?: boolean
  type?: 'text' | 'search'
  name?: string
  onBlur?: () => void
  onEnter?: () => void
}

export function TextField({
  label,
  hint,
  error,
  hideLabel,
  value,
  onChange,
  placeholder,
  maxLength,
  autoFocus,
  type = 'text',
  name,
  onBlur,
  onEnter,
}: TextFieldProps) {
  const id = useId()
  const described = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="atl-field" data-invalid={Boolean(error)}>
      <label htmlFor={id} className={cx('atl-field-label', hideLabel && 'atl-visually-hidden')}>
        {label}
      </label>
      <input
        id={id}
        className="atl-input"
        type={type}
        name={name}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={described}
        onChange={(event) => onChange(event.target.value)}
        onBlur={onBlur}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && onEnter) {
            event.preventDefault()
            onEnter()
          }
        }}
      />
      {(hint || error) && (
        <div className="atl-field-foot">
          {error ? (
            <span id={`${id}-error`} className="atl-field-error">
              {error}
            </span>
          ) : (
            <span id={`${id}-hint`}>{hint}</span>
          )}
        </div>
      )}
    </div>
  )
}

export interface TextAreaProps extends FieldShell {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  rows?: number
  maxLength?: number
  counter?: boolean
  autoFocus?: boolean
}

export function TextArea({
  label,
  hint,
  error,
  hideLabel,
  value,
  onChange,
  placeholder,
  rows = 6,
  maxLength,
  counter,
  autoFocus,
}: TextAreaProps) {
  const id = useId()
  const described = [hint ? `${id}-hint` : '', error ? `${id}-error` : '', counter ? `${id}-count` : '']
    .filter(Boolean)
    .join(' ')
  return (
    <div className="atl-field" data-invalid={Boolean(error)}>
      <label htmlFor={id} className={cx('atl-field-label', hideLabel && 'atl-visually-hidden')}>
        {label}
      </label>
      <textarea
        id={id}
        className="atl-textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoFocus={autoFocus}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={described || undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {(hint || error || counter) && (
        <div className="atl-field-foot">
          {error ? (
            <span id={`${id}-error`} className="atl-field-error">
              {error}
            </span>
          ) : (
            <span id={`${id}-hint`}>{hint}</span>
          )}
          {counter && (
            <span id={`${id}-count`} className="atl-tabular">
              {value.length.toLocaleString()}
              {maxLength ? ` / ${maxLength.toLocaleString()}` : ''} characters
            </span>
          )}
        </div>
      )}
    </div>
  )
}

// -------------------------------------------------------------------- Select

export interface SelectProps<T extends string> {
  label: string
  value: T
  options: Array<{ value: T; label: string }>
  onChange: (value: T) => void
  hideLabel?: boolean
}

export function Select<T extends string>({ label, value, options, onChange, hideLabel }: SelectProps<T>) {
  const id = useId()
  return (
    <div className="atl-field">
      <label htmlFor={id} className={cx('atl-field-label', hideLabel && 'atl-visually-hidden')}>
        {label}
      </label>
      <div className="atl-select">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value as T)}>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown aria-hidden size={16} strokeWidth={1.75} />
      </div>
    </div>
  )
}
