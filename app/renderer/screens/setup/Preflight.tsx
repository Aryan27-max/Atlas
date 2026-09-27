import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, FileSpreadsheet, RefreshCw } from 'lucide-react'
import { useId, useState } from 'react'
import type { IssueGroupOut, PreflightOut } from '@shared/api-types'
import { Badge, Banner, Button } from '../../design'
import { plural } from '../../format'

const SHOWN = 40

/** The engine's pre-flight report, as UI (nothing here decides anything). */
export function Preflight({ report, onReplace }: { report: PreflightOut; onReplace: () => void }) {
  const { summary } = report
  const fileBroken = report.file_errors.length > 0
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div className="file-head">
        <FileSpreadsheet aria-hidden size={20} strokeWidth={1.75} />
        <span className="file-name atl-selectable">{report.source}</span>
        <Button size="small" icon={RefreshCw} onClick={onReplace}>
          Replace file
        </Button>
      </div>

      {fileBroken ? (
        <Banner tone="error" title="This file can't be used yet">
          <ul style={{ margin: 0, paddingLeft: '1.1em' }}>
            {report.file_errors.map((issue) => (
              <li key={issue.code + issue.message}>{issue.message}</li>
            ))}
          </ul>
        </Banner>
      ) : (
        <div className="stat-row" role="group" aria-label="File summary">
          <Stat value={summary.rows_read} label="rows read" />
          <Stat value={summary.ready} label="ready to screen" />
          <Stat value={summary.skipped} label="will be skipped" />
          <Stat value={summary.warnings} label={summary.warnings === 1 ? 'warning' : 'warnings'} />
        </div>
      )}

      {!fileBroken && summary.skipped > 0 && (
        <p className="atl-callout">
          {plural(summary.skipped, 'row')} will be skipped and not screened. The other {summary.ready.toLocaleString()}{' '}
          are ready.
        </p>
      )}
      {!fileBroken && report.groups.length === 0 && (
        <p className="atl-callout" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <CheckCircle2 aria-hidden size={18} strokeWidth={1.75} className="status-ok" />
          Everything looks good.
        </p>
      )}

      {report.groups.length > 0 && (
        <div role="list" aria-label="Problems found in the file">
          {report.groups.map((group) => (
            <IssueGroup key={group.code} group={group} />
          ))}
        </div>
      )}

      {report.notes.length > 0 && (
        <ul className="atl-footnote atl-secondary" style={{ margin: 0, paddingLeft: '1.1em' }}>
          {report.notes.map((note) => (
            <li key={note.code + note.message}>{note.message}</li>
          ))}
        </ul>
      )}
    </div>
  )
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="stat">
      <span className="stat-value">{value.toLocaleString()}</span>
      <span className="stat-label">{label}</span>
    </div>
  )
}

function IssueGroup({ group }: { group: IssueGroupOut }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const Icon = group.severity === 'error' ? AlertCircle : AlertTriangle
  const rows = group.rows.slice(0, SHOWN)
  const ras = group.ra_numbers.filter(Boolean)
  return (
    <div className="issue-group" role="listitem">
      <button
        type="button"
        className="issue-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <Icon
          aria-hidden
          size={16}
          strokeWidth={2}
          className={group.severity === 'error' ? 'issue-error' : 'issue-warning'}
        />
        <span className="issue-label atl-callout">{group.label}</span>
        <Badge tone={group.severity === 'error' ? 'danger' : 'warning'}>{group.count.toLocaleString()}</Badge>
        <ChevronRight aria-hidden size={16} strokeWidth={1.75} className="issue-chevron" />
      </button>
      {open && (
        <div id={id} className="issue-detail">
          {group.skipped && <span>These rows will be skipped.</span>}
          <span>
            {group.rows.length === 1 ? 'Row ' : 'Rows '}
            {rows.join(', ')}
            {group.rows.length > SHOWN ? ` and ${group.rows.length - SHOWN} more` : ''}
          </span>
          {ras.length > 0 && (
            <span>
              RA {ras.slice(0, SHOWN).join(', ')}
              {ras.length > SHOWN ? ` and ${ras.length - SHOWN} more` : ''}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
