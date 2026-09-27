import { Check, ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cx } from './cx'

// ---------------------------------------------------------------------- Card

export interface CardProps {
  title?: ReactNode
  subtitle?: ReactNode
  accessory?: ReactNode
  flush?: boolean
  className?: string
  children: ReactNode
  labelledBy?: string
}

export function Card({ title, subtitle, accessory, flush, className, children, labelledBy }: CardProps) {
  return (
    <section className={cx('atl-card', flush && 'atl-card--flush', className)} aria-labelledby={labelledBy}>
      {(title || accessory) && (
        <div className="atl-card-head">
          <div>
            {title && (
              <h2 id={labelledBy} className="atl-headline">
                {title}
              </h2>
            )}
            {subtitle && <p className="atl-footnote atl-secondary">{subtitle}</p>}
          </div>
          {accessory}
        </div>
      )}
      <div className="atl-card-body">{children}</div>
    </section>
  )
}

// ------------------------------------------------------------ List, ListRow

export interface ListProps {
  title?: string
  label?: string
  /** Rows are a single choice (e.g. the model picker): radio-group semantics. */
  choice?: boolean
  children: ReactNode
}

export function List({ title, children, label, choice }: ListProps) {
  return (
    <div>
      {title && <div className="atl-list-title">{title}</div>}
      <ul
        className={cx('atl-list', choice && 'atl-list--choice')}
        aria-label={label ?? title}
        role={choice ? 'radiogroup' : undefined}
      >
        {children}
      </ul>
    </div>
  )
}

export interface ListRowProps {
  title: ReactNode
  subtitle?: ReactNode
  icon?: LucideIcon
  detail?: ReactNode
  onClick?: () => void
  /** Shows a chevron: the row opens something. */
  navigates?: boolean
  /** A choice among rows (model picker): radio semantics and a checkmark. */
  selected?: boolean
  selectable?: boolean
  disabled?: boolean
}

export function ListRow({
  title,
  subtitle,
  icon: Icon,
  detail,
  onClick,
  navigates,
  selected,
  selectable,
  disabled,
}: ListRowProps) {
  const content = (
    <>
      {Icon && (
        <span className="atl-row-icon">
          <Icon aria-hidden size={18} strokeWidth={1.75} />
        </span>
      )}
      <span className="atl-row-text">
        <span className="atl-row-title">{title}</span>
        {subtitle && <span className="atl-row-subtitle">{subtitle}</span>}
      </span>
      {(detail || navigates || selectable) && (
        <span className="atl-row-detail">
          {detail}
          {selectable && selected && <Check aria-hidden size={16} strokeWidth={2.25} color="var(--accent-text)" />}
          {navigates && <ChevronRight aria-hidden size={16} strokeWidth={1.75} />}
        </span>
      )}
    </>
  )
  return (
    <li role={selectable ? 'none' : undefined}>
      {onClick ? (
        <button
          type="button"
          className="atl-row"
          onClick={onClick}
          disabled={disabled}
          role={selectable ? 'radio' : undefined}
          aria-checked={selectable ? Boolean(selected) : undefined}
        >
          {content}
        </button>
      ) : (
        <div className="atl-row">{content}</div>
      )}
    </li>
  )
}

// ------------------------------------------------------------------- Sidebar

export interface SidebarItem<T extends string> {
  id: T
  label: string
  icon: LucideIcon
  count?: number
}

export interface SidebarSection<T extends string> {
  title?: string
  items: SidebarItem<T>[]
}

export interface SidebarProps<T extends string> {
  label: string
  sections: SidebarSection<T>[]
  selected: T
  onSelect: (id: T) => void
  footer?: ReactNode
}

export function Sidebar<T extends string>({ label, sections, selected, onSelect, footer }: SidebarProps<T>) {
  return (
    <nav className="atl-sidebar" aria-label={label}>
      <div className="atl-sidebar-top atl-drag" />
      {sections.map((section, i) => (
        <div key={section.title ?? i} className="atl-sidebar-section">
          {section.title && <div className="atl-sidebar-heading">{section.title}</div>}
          {section.items.map((item) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className="atl-sidebar-item"
                aria-current={item.id === selected ? 'page' : undefined}
                onClick={() => onSelect(item.id)}
              >
                <Icon aria-hidden size={16} strokeWidth={1.75} />
                <span className="atl-sidebar-label">{item.label}</span>
                {item.count !== undefined && (
                  <span className="atl-sidebar-count" aria-label={`${item.count.toLocaleString()} candidates`}>
                    {item.count.toLocaleString()}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}
      {footer && <div style={{ marginTop: 'auto' }}>{footer}</div>}
    </nav>
  )
}

// ------------------------------------------------------------------- Toolbar

export interface ToolbarProps {
  title?: ReactNode
  leading?: ReactNode
  trailing?: ReactNode
  /** The toolbar starts at the window's left edge (leave room for macOS traffic lights). */
  windowEdgeLeft?: boolean
  /** The toolbar reaches the window's right edge (leave room for Windows controls). */
  windowEdgeRight?: boolean
  material?: boolean
}

export function Toolbar({ title, leading, trailing, windowEdgeLeft, windowEdgeRight = true, material }: ToolbarProps) {
  return (
    <header
      className={cx(
        'atl-toolbar atl-drag',
        windowEdgeLeft && 'atl-toolbar--window-edge',
        windowEdgeRight && 'atl-toolbar--window-edge-right',
        material && 'atl-toolbar--material',
      )}
    >
      {leading && <div className="atl-toolbar-group">{leading}</div>}
      {title && <h1 className="atl-toolbar-title">{title}</h1>}
      <div className="atl-toolbar-spacer" />
      {trailing && <div className="atl-toolbar-group">{trailing}</div>}
    </header>
  )
}

// ------------------------------------------------------------------ KeyValue

export function KeyValue({
  items,
  className,
}: {
  items: Array<{ key: string; value: ReactNode }>
  className?: string
}) {
  return (
    <dl className={cx('atl-kv', className)}>
      {items.map((item) => (
        <div key={item.key} style={{ display: 'contents' }}>
          <dt>{item.key}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
