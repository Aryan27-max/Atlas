/**
 * #/design — every component, in the light and dark theme side by side.
 * Fictional data only. Used for review and for the step's screenshots.
 */

import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  CircleSlash,
  FileSpreadsheet,
  Inbox,
  Monitor,
  Moon,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Users,
} from 'lucide-react'
import { type ReactNode, useRef, useState } from 'react'
import './gallery.css'
import {
  Alert,
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  KeyValue,
  List,
  ListRow,
  Popover,
  ProgressBar,
  ProgressRing,
  ScorePill,
  SegmentedControl,
  Select,
  Sheet,
  Sidebar,
  Slider,
  Spinner,
  Stepper,
  TextArea,
  TextField,
  Toggle,
  Toolbar,
  useToast,
} from '.'

type Theme = 'light' | 'dark'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="gallery-section">
      <h2 className="atl-footnote atl-tertiary gallery-section-title">{title}</h2>
      <div className="gallery-section-body">{children}</div>
    </section>
  )
}

function Column({ theme }: { theme: Theme }) {
  const [segment, setSegment] = useState<'all' | 'shortlisted' | 'cutoff'>('all')
  const [toggle, setToggle] = useState(true)
  const [slider, setSlider] = useState(60)
  const [stepper, setStepper] = useState(7.5)
  const [text, setText] = useState('Screening 28 Sep')
  const [area, setArea] = useState('Software engineering interns with solid Python projects.')
  const [choice, setChoice] = useState('qwen3:8b')
  const [bucket, setBucket] = useState<'shortlisted' | 'cutoff'>('shortlisted')
  const [sheet, setSheet] = useState(false)
  const [alert, setAlert] = useState(false)
  const [popover, setPopover] = useState(false)
  const anchor = useRef<HTMLButtonElement>(null)
  const toast = useToast()

  return (
    <div className="gallery-column" data-theme={theme}>
      <Toolbar
        title={`Toolbar · ${theme}`}
        windowEdgeRight={false}
        trailing={
          <>
            <Button size="small" icon={SlidersHorizontal} ref={anchor} onClick={() => setPopover(true)}>
              Adjust cutoffs
            </Button>
            <Button size="small" variant="primary">
              Export
            </Button>
          </>
        }
      />
      <div className="gallery-content">
        <Section title="Buttons">
          <div className="gallery-row">
            <Button variant="primary">Primary</Button>
            <Button>Secondary</Button>
            <Button variant="plain">Plain</Button>
            <Button variant="destructive">Destructive</Button>
          </div>
          <div className="gallery-row">
            <Button variant="primary" size="large">
              Start screening
            </Button>
            <Button size="small" icon={Sparkles}>
              Small
            </Button>
            <Button loading>Loading</Button>
            <Button disabled>Disabled</Button>
          </div>
        </Section>

        <Section title="Segmented control · Toggle · Select">
          <SegmentedControl
            label="Bucket"
            value={segment}
            onChange={setSegment}
            options={[
              { value: 'all', label: 'All' },
              { value: 'shortlisted', label: 'Shortlisted' },
              { value: 'cutoff', label: 'Cutoff' },
            ]}
          />
          <SegmentedControl
            label="Appearance"
            value={theme === 'dark' ? 'dark' : 'light'}
            onChange={() => undefined}
            options={[
              { value: 'system', label: 'System', icon: Monitor },
              { value: 'light', label: 'Light', icon: Sun },
              { value: 'dark', label: 'Dark', icon: Moon },
            ]}
          />
          <Toggle
            checked={toggle}
            onChange={setToggle}
            label="Keep computer awake"
            description="While screening runs"
          />
          <Select
            label="Default model"
            value={choice}
            onChange={setChoice}
            options={[
              { value: 'qwen3:8b', label: 'qwen3:8b' },
              { value: 'qwen3:4b', label: 'qwen3:4b' },
            ]}
          />
        </Section>

        <Section title="Slider · Stepper">
          <Slider label="Shortlist score" value={slider} onChange={setSlider} ticks={[0, 25, 50, 75, 100]} />
          <div className="gallery-row">
            <Stepper label="Minimum CGPA" value={stepper} onChange={setStepper} min={0} max={10} step={0.1} />
            <Stepper label="Minimum shortlisted" value={15} onChange={() => undefined} min={0} max={500} />
          </div>
        </Section>

        <Section title="Text field · Text area">
          <TextField label="Screening name" value={text} onChange={setText} hint="Shown on the Welcome screen." />
          <TextField
            label="Search"
            value=""
            onChange={() => undefined}
            placeholder="Name or RA number"
            error="Nothing matches."
          />
          <TextArea label="What are you looking for?" value={area} onChange={setArea} rows={3} counter />
        </Section>

        <Section title="Card · List · KeyValue">
          <Card
            title="Summary"
            subtitle="Everything you chose"
            accessory={
              <Button size="small" variant="plain">
                Edit
              </Button>
            }
          >
            <KeyValue
              items={[
                { key: 'File', value: 'students.xlsx · 412 students' },
                { key: 'Model', value: 'qwen3:8b' },
                { key: 'Shortlist at', value: '60' },
              ]}
            />
          </Card>
          <List title="Installed models" choice>
            <ListRow
              title="qwen3:8b"
              subtitle="5.2 GB · Ready"
              icon={CheckCircle2}
              selectable
              selected={choice === 'qwen3:8b'}
              onClick={() => setChoice('qwen3:8b')}
            />
            <ListRow
              title="qwen3:4b"
              subtitle="2.5 GB · Not tested yet"
              icon={Sparkles}
              selectable
              selected={choice === 'qwen3:4b'}
              onClick={() => setChoice('qwen3:4b')}
            />
            <ListRow title="Get another model" icon={Inbox} navigates onClick={() => undefined} />
          </List>
        </Section>

        <Section title="Banners · Badges · Score pills">
          <Banner
            tone="warning"
            title="Ollama isn't running"
            action={{ label: 'Check again', onClick: () => undefined }}
          >
            Atlas will continue automatically when this is fixed.
          </Banner>
          <Banner tone="error" title="Link is private">
            Ask the student to set sharing to “Anyone with the link”.
          </Banner>
          <Banner tone="info" title="Rough estimate">
            After the first 5 résumés, Atlas shows a measured time.
          </Banner>
          <Banner tone="success" title="Screening complete" />
          <div className="gallery-row">
            <Badge tone="accent">Filled to minimum</Badge>
            <Badge>Moved by you</Badge>
            <Badge tone="warning">Tie</Badge>
            <Badge tone="danger" icon={AlertTriangle}>
              Needs attention
            </Badge>
            <Badge tone="success">Ready</Badge>
          </div>
          <div className="gallery-row">
            <ScorePill score={86} bucket="shortlisted" />
            <ScorePill score={55} bucket="cutoff" />
            <ScorePill score={31} bucket="rejected" />
            <Button size="small" onClick={() => setBucket(bucket === 'shortlisted' ? 'cutoff' : 'shortlisted')}>
              Move pill
            </Button>
            <ScorePill score={61} bucket={bucket} />
          </div>
        </Section>

        <Section title="Progress">
          <div className="gallery-row" style={{ alignItems: 'center', gap: 'var(--space-8)' }}>
            <ProgressRing value={0.62} label="Screening progress" valueText="258 of 412">
              <span className="atl-title atl-tabular">258</span>
              <span className="atl-footnote atl-secondary">of 412</span>
            </ProgressRing>
            <div style={{ flex: 1, display: 'grid', gap: 'var(--space-4)' }}>
              <ProgressBar value={0.35} label="Downloading qwen3:8b" />
              <ProgressBar label="Testing this model" />
              <div className="gallery-row">
                <Spinner label="Loading" />
                <span className="atl-footnote atl-secondary">Testing this model… (usually under 2 minutes)</span>
              </div>
            </div>
          </div>
        </Section>

        <Section title="Empty state · Overlays">
          <Card flush>
            <EmptyState
              icon={Users}
              title="No one here yet"
              message="Candidates who reach the shortlist score appear here."
              action={{ label: 'Adjust cutoffs', onClick: () => undefined }}
            />
          </Card>
          <div className="gallery-row">
            <Button onClick={() => setSheet(true)}>Open sheet</Button>
            <Button variant="destructive" onClick={() => setAlert(true)}>
              Cancel screening…
            </Button>
            <Button
              onClick={() =>
                toast({
                  message: 'Exported 412 candidates',
                  action: { label: 'Show in folder', onClick: () => undefined },
                })
              }
            >
              Show toast
            </Button>
          </div>
        </Section>
      </div>

      <Sheet
        open={sheet}
        onClose={() => setSheet(false)}
        title="Export results"
        description="Choose which candidates to include."
        footer={
          <>
            <Button onClick={() => setSheet(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => setSheet(false)}>
              Export…
            </Button>
          </>
        }
      >
        <List choice label="View">
          <ListRow title="All candidates" selectable selected onClick={() => undefined} icon={FileSpreadsheet} />
          <ListRow title="Needs attention" selectable onClick={() => undefined} icon={Ban} />
        </List>
      </Sheet>
      <Alert
        open={alert}
        title="Cancel this screening?"
        message="Résumés already scored are kept. The rest won't be screened."
        actions={[{ label: 'Cancel screening', variant: 'destructive', onClick: () => setAlert(false) }]}
        cancel={{ label: 'Keep screening', onClick: () => setAlert(false) }}
      />
      <Popover open={popover} onClose={() => setPopover(false)} anchor={anchor} label="Adjust cutoffs">
        <Slider label="Shortlist score" value={slider} onChange={setSlider} />
        <p className="atl-footnote atl-secondary" style={{ marginTop: 'var(--space-3)' }}>
          +12 to Shortlisted, −12 from Cutoff
        </p>
      </Popover>
    </div>
  )
}

export function Gallery() {
  return (
    <div className="gallery" data-testid="design-gallery">
      <div className="gallery-head">
        <h1 className="atl-large-title">Design system</h1>
        <p className="atl-callout atl-secondary">Every component in both themes. Fictional data.</p>
      </div>
      <div className="gallery-columns">
        <Column theme="light" />
        <Column theme="dark" />
      </div>
      <div className="gallery-sidebars">
        {(['light', 'dark'] as const).map((theme) => (
          <div key={theme} data-theme={theme} className="gallery-sidebar-frame">
            <Sidebar
              label={`Buckets (${theme})`}
              selected="shortlisted"
              onSelect={() => undefined}
              sections={[
                {
                  title: 'Results',
                  items: [
                    { id: 'shortlisted', label: 'Shortlisted', icon: CheckCircle2, count: 64 },
                    { id: 'cutoff', label: 'Cutoff', icon: CircleSlash, count: 51 },
                    { id: 'rejected', label: 'Rejected', icon: Ban, count: 280 },
                  ],
                },
                {
                  title: 'Other',
                  items: [
                    { id: 'failed', label: 'Needs attention', icon: AlertTriangle, count: 12 },
                    { id: 'filtered', label: 'Filtered out', icon: SlidersHorizontal, count: 5 },
                  ],
                },
              ]}
            />
          </div>
        ))}
      </div>
    </div>
  )
}
