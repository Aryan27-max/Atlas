import { X } from 'lucide-react'
import { AnimatePresence, motion } from 'motion/react'
import { type ReactNode, type RefObject, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button, type ButtonVariant } from './controls'
import { cx } from './cx'
import { fade, gentle } from './motion'

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/**
 * While a modal is open: focus moves into it, Tab cycles inside it, Esc
 * closes it, the rest of the app is inert, and focus returns to what opened
 * it when it closes.
 */
const openModals: symbol[] = [] // only the top-most modal answers keys (an Alert over a Sheet)

function useModal(
  open: boolean,
  container: RefObject<HTMLElement | null>,
  onClose: () => void,
  initial?: RefObject<HTMLElement | null>,
): void {
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const token = Symbol('modal')
    openModals.push(token)
    const opener = document.activeElement as HTMLElement | null
    const root = document.getElementById('root')
    root?.setAttribute('inert', '')
    const focusFirst = (): void => {
      const node = container.current
      if (!node) return
      const target =
        initial?.current ??
        node.querySelector<HTMLElement>('[data-autofocus]') ??
        node.querySelector<HTMLElement>(FOCUSABLE) ??
        node
      target.focus()
    }
    const frame = requestAnimationFrame(focusFirst)
    const onKey = (event: KeyboardEvent): void => {
      if (openModals[openModals.length - 1] !== token) return
      if (event.key === 'Escape') {
        event.stopPropagation()
        close.current()
        return
      }
      if (event.key !== 'Tab' || !container.current) return
      const items = [...container.current.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey, true)
      openModals.splice(openModals.indexOf(token), 1)
      if (!openModals.length) root?.removeAttribute('inert')
      opener?.focus?.()
    }
  }, [open, container, initial])
}

// --------------------------------------------------------------------- Sheet

export interface SheetProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children: ReactNode
  footer?: ReactNode
  size?: 'regular' | 'large'
}

export function Sheet({ open, onClose, title, description, children, footer, size = 'regular' }: SheetProps) {
  const ref = useRef<HTMLDivElement>(null)
  const id = useId()
  useModal(open, ref, onClose)
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="atl-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose()
          }}
        >
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            aria-describedby={description ? `${id}-desc` : undefined}
            tabIndex={-1}
            className={cx('atl-sheet', size === 'large' && 'atl-sheet--large')}
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            transition={gentle}
          >
            <div className="atl-sheet-head">
              <div>
                <h2 id={`${id}-title`} className="atl-title">
                  {title}
                </h2>
                {description && (
                  <p id={`${id}-desc`} className="atl-callout atl-secondary" style={{ marginTop: 'var(--space-1)' }}>
                    {description}
                  </p>
                )}
              </div>
              <button type="button" className="atl-icon-button" aria-label="Close" onClick={onClose}>
                <X aria-hidden size={14} strokeWidth={2} />
              </button>
            </div>
            <div className="atl-sheet-body">{children}</div>
            {footer && <div className="atl-sheet-foot">{footer}</div>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// ------------------------------------------------------------------- Popover

export interface PopoverProps {
  open: boolean
  onClose: () => void
  anchor: RefObject<HTMLElement | null>
  label: string
  children: ReactNode
  align?: 'start' | 'end'
  /** Fixed width in px (still fits a narrow window). */
  width?: number
}

export function Popover({ open, onClose, anchor, label, children, align = 'end', width }: PopoverProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [position, setPosition] = useState<{ top: number; left?: number; right?: number }>({ top: 0 })
  useModal(open, ref, onClose)
  useLayoutEffect(() => {
    if (!open || !anchor.current) return
    const rect = anchor.current.getBoundingClientRect()
    setPosition(
      align === 'end'
        ? { top: rect.bottom + 8, right: Math.max(8, window.innerWidth - rect.right) }
        : { top: rect.bottom + 8, left: Math.max(8, rect.left) },
    )
  }, [open, anchor, align])
  useEffect(() => {
    if (!open) return
    const onDown = (event: MouseEvent): void => {
      const target = event.target as Node
      if (!ref.current?.contains(target) && !anchor.current?.contains(target)) onClose()
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open, anchor, onClose])
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          ref={ref}
          role="dialog"
          aria-label={label}
          aria-modal="true"
          tabIndex={-1}
          className="atl-popover"
          style={width ? { ...position, width, maxWidth: 'calc(100vw - 16px)' } : position}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -4, scale: 0.98 }}
          transition={gentle}
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}

// --------------------------------------------------------------------- Alert

export interface AlertAction {
  label: string
  variant?: ButtonVariant
  onClick: () => void
  loading?: boolean
}

export interface AlertProps {
  open: boolean
  title: string
  message?: ReactNode
  /** First action is the default; the cancel action runs on Esc. */
  actions: AlertAction[]
  cancel: AlertAction
}

export function Alert({ open, title, message, actions, cancel }: AlertProps) {
  const ref = useRef<HTMLDivElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const id = useId()
  useModal(open, ref, cancel.onClick, cancelRef)
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="atl-scrim"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={fade}
        >
          <motion.div
            ref={ref}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={`${id}-title`}
            aria-describedby={message ? `${id}-message` : undefined}
            className="atl-alert"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={gentle}
          >
            <h2 id={`${id}-title`} className="atl-headline">
              {title}
            </h2>
            {message && (
              <p id={`${id}-message`} className="atl-alert-message">
                {message}
              </p>
            )}
            <div className="atl-alert-actions">
              {actions.map((action) => (
                <Button
                  key={action.label}
                  variant={action.variant ?? 'primary'}
                  fullWidth
                  onClick={action.onClick}
                  loading={action.loading}
                >
                  {action.label}
                </Button>
              ))}
              <Button ref={cancelRef} variant={cancel.variant ?? 'secondary'} fullWidth onClick={cancel.onClick}>
                {cancel.label}
              </Button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
