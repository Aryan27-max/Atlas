import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon, X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from './controls'
import { cx } from './cx'
import { gentle } from './motion'

export { Spinner } from './spinner'

// -------------------------------------------------------------------- Banner

export type BannerTone = 'info' | 'warning' | 'error' | 'success'

const BANNER_ICON: Record<BannerTone, LucideIcon> = {
  info: Info,
  warning: AlertTriangle,
  error: AlertCircle,
  success: CheckCircle2,
}

export interface BannerAction {
  label: string
  onClick: () => void
  loading?: boolean
}

export interface BannerProps {
  tone?: BannerTone
  title: string
  children?: ReactNode
  action?: BannerAction
  secondaryAction?: BannerAction
  icon?: LucideIcon
}

export function Banner({ tone = 'info', title, children, action, secondaryAction, icon }: BannerProps) {
  const Icon = icon ?? BANNER_ICON[tone]
  return (
    <div className={cx('atl-banner', `atl-banner--${tone}`)} role={tone === 'error' ? 'alert' : 'status'}>
      <Icon className="atl-banner-icon" aria-hidden size={20} strokeWidth={1.75} />
      <div className="atl-banner-text">
        <span className="atl-banner-title">{title}</span>
        {children && <div className="atl-banner-body">{children}</div>}
      </div>
      {(action || secondaryAction) && (
        <div className="atl-banner-actions">
          {secondaryAction && (
            <Button size="small" variant="plain" onClick={secondaryAction.onClick} loading={secondaryAction.loading}>
              {secondaryAction.label}
            </Button>
          )}
          {action && (
            <Button size="small" variant="secondary" onClick={action.onClick} loading={action.loading}>
              {action.label}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}

// --------------------------------------------------------------------- Badge

export type BadgeTone = 'neutral' | 'accent' | 'success' | 'warning' | 'danger'

export function Badge({
  tone = 'neutral',
  icon: Icon,
  children,
}: {
  tone?: BadgeTone
  icon?: LucideIcon
  children: ReactNode
}) {
  return (
    <span className={cx('atl-badge', tone !== 'neutral' && `atl-badge--${tone}`)}>
      {Icon && <Icon aria-hidden size={12} strokeWidth={2} />}
      {children}
    </span>
  )
}

// ----------------------------------------------------------------- ScorePill

export type PillBucket = 'shortlisted' | 'cutoff' | 'rejected' | 'none'

const BUCKET_LABEL: Record<PillBucket, string> = {
  shortlisted: 'Shortlisted',
  cutoff: 'Cutoff',
  rejected: 'Rejected',
  none: 'Not placed',
}

/** A score, coloured by the bucket it landed in (never a red-to-green scale). */
export function ScorePill({ score, bucket }: { score: number; bucket: PillBucket }) {
  return (
    <span
      className={cx('atl-pill', bucket !== 'none' && `atl-pill--${bucket}`)}
      role="img"
      aria-label={`Score ${score}, ${BUCKET_LABEL[bucket]}`}
    >
      {score}
    </span>
  )
}

// -------------------------------------------------------------- ProgressRing

export interface ProgressRingProps {
  /** 0–1 */
  value: number
  size?: number
  stroke?: number
  label: string
  valueText?: string
  children?: ReactNode
}

export function ProgressRing({ value, size = 160, stroke = 12, label, valueText, children }: ProgressRingProps) {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
  const radius = (size - stroke) / 2
  const circumference = 2 * Math.PI * radius
  return (
    <div
      className="atl-ring"
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped * 100)}
      aria-valuetext={valueText}
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} aria-hidden>
        <circle className="atl-ring-track" cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} />
        <circle
          className="atl-ring-value"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped)}
        />
      </svg>
      {children && <div className="atl-ring-center">{children}</div>}
    </div>
  )
}

// --------------------------------------------------------------- ProgressBar

export function ProgressBar({ value, label }: { value?: number; label: string }) {
  const indeterminate = value === undefined
  const pct = indeterminate ? undefined : Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div
      className={cx('atl-bar', indeterminate && 'atl-bar--indeterminate')}
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
    >
      <div className="atl-bar-value" style={indeterminate ? undefined : { width: `${pct}%` }} />
    </div>
  )
}

// ---------------------------------------------------------------- EmptyState

export interface EmptyStateProps {
  icon: LucideIcon
  title: string
  message?: ReactNode
  action?: { label: string; onClick: () => void }
}

export function EmptyState({ icon: Icon, title, message, action }: EmptyStateProps) {
  return (
    <div className="atl-empty">
      <Icon className="atl-empty-icon" aria-hidden size={40} strokeWidth={1.25} />
      <h2 className="atl-empty-title">{title}</h2>
      {message && <p className="atl-empty-message">{message}</p>}
      {action && (
        <Button variant="secondary" onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  )
}

// --------------------------------------------------------------------- Toast

export interface ToastInput {
  message: string
  icon?: LucideIcon
  action?: { label: string; onClick: () => void }
  /** ms; 0 keeps it until dismissed */
  duration?: number
}

interface ToastItem extends ToastInput {
  id: number
}

const ToastContext = createContext<(toast: ToastInput) => void>(() => undefined)

export function useToast(): (toast: ToastInput) => void {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const next = useRef(1)
  const dismiss = useCallback((id: number) => setToasts((all) => all.filter((t) => t.id !== id)), [])
  const show = useCallback((toast: ToastInput) => {
    const id = next.current++
    setToasts((all) => [...all.slice(-2), { ...toast, id }])
  }, [])
  const value = useMemo(() => show, [show])
  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="atl-toasts" aria-live="polite" aria-atomic="false">
        <AnimatePresence initial={false}>
          {toasts.map((toast) => (
            <ToastView key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

function ToastView({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }) {
  const [hovered, setHovered] = useState(false)
  const duration = toast.duration ?? 5000
  useEffect(() => {
    if (!duration || hovered) return
    const timer = setTimeout(onDismiss, duration)
    return () => clearTimeout(timer)
  }, [duration, hovered, onDismiss])
  const Icon = toast.icon ?? CheckCircle2
  return (
    <motion.div
      className="atl-toast"
      role="status"
      layout
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 8, scale: 0.98 }}
      transition={gentle}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <Icon className="atl-toast-icon" aria-hidden size={18} strokeWidth={1.75} />
      <span className="atl-toast-text">{toast.message}</span>
      {toast.action && (
        <Button
          size="small"
          variant="plain"
          onClick={() => {
            toast.action?.onClick()
            onDismiss()
          }}
        >
          {toast.action.label}
        </Button>
      )}
      <button type="button" className="atl-icon-button" aria-label="Dismiss" onClick={onDismiss}>
        <X aria-hidden size={14} strokeWidth={2} />
      </button>
    </motion.div>
  )
}
