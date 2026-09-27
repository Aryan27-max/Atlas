import { useMutation } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, CircleSlash, FileSpreadsheet, Users, XCircle } from 'lucide-react'
import { useState } from 'react'
import type { BucketCountsOut } from '@shared/api-types'
import type { ExportView } from '@shared/bridge'
import { Banner, Button, List, ListRow, Sheet, useToast } from '../../design'
import { plural } from '../../format'

// Every count is the engine's; "All" is the results total, not a sum made here.
const VIEWS: Array<{
  view: ExportView
  label: string
  icon: typeof Users
  count: (c: BucketCountsOut, total: number) => number
}> = [
  { view: 'all', label: 'All candidates', icon: Users, count: (_c, total) => total },
  { view: 'shortlisted', label: 'Shortlisted', icon: CheckCircle2, count: (c) => c.shortlisted },
  { view: 'cutoff', label: 'Cutoff', icon: CircleSlash, count: (c) => c.cutoff },
  { view: 'rejected', label: 'Rejected', icon: XCircle, count: (c) => c.rejected },
  { view: 'failed', label: 'Needs attention', icon: AlertTriangle, count: (c) => c.failed },
]

interface ExportSheetProps {
  open: boolean
  runId: number
  runName: string
  counts: BucketCountsOut | undefined
  total: number
  onClose: () => void
}

export function ExportSheet({ open, runId, runName, counts, total, onClose }: ExportSheetProps) {
  const [view, setView] = useState<ExportView>('all')
  const toast = useToast()
  const save = useMutation({
    mutationFn: async () => {
      const label = VIEWS.find((v) => v.view === view)?.label ?? view
      const result = await window.atlas.files.saveExport(runId, view, `${runName} - ${label}`)
      if (result === null) return null
      if (!result.ok) throw new Error(result.error.message)
      return result.data
    },
    onSuccess: (written) => {
      if (!written) return
      onClose()
      toast({
        message: `Exported ${plural(written.written, 'candidate')}`,
        icon: FileSpreadsheet,
        action: {
          label: 'Show in folder',
          onClick: () => void window.atlas.files.showInFolder({ kind: 'export', path: written.path }),
        },
        duration: 8000,
      })
    },
  })
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Export results"
      description="A CSV that opens in Excel, with the scores, reasons and bucket for each candidate."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isPending} onClick={() => save.mutate()}>
            Export…
          </Button>
        </>
      }
    >
      <div className="export-choices">
        <List label="What to export" choice>
          {VIEWS.map((item) => (
            <ListRow
              key={item.view}
              title={item.label}
              icon={item.icon}
              detail={counts ? item.count(counts, total).toLocaleString() : undefined}
              selectable
              selected={view === item.view}
              onClick={() => setView(item.view)}
            />
          ))}
        </List>
      </div>
      {save.isError && (
        <div style={{ marginTop: 'var(--space-4)' }}>
          <Banner tone="error" title="The file couldn't be saved">
            {save.error instanceof Error ? save.error.message : ''}
          </Banner>
        </div>
      )}
    </Sheet>
  )
}
