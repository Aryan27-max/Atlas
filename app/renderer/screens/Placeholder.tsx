import { ChevronLeft } from 'lucide-react'
import { Button, Toolbar } from '../design'
import { useNav } from '../state/nav'

/** Screens still to come keep the chrome and a way back. */
export function Placeholder({ title }: { title: string }) {
  const go = useNav((state) => state.go)
  return (
    <div className="screen">
      <Toolbar
        windowEdgeLeft
        title={title}
        leading={
          <Button size="small" variant="plain" icon={ChevronLeft} onClick={() => go({ name: 'welcome' })}>
            Home
          </Button>
        }
      />
    </div>
  )
}
