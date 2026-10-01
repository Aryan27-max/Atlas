// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CheckCircle2 } from 'lucide-react'
import { useRef, useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  Alert,
  Banner,
  Button,
  List,
  ListRow,
  Popover,
  ProgressBar,
  ProgressRing,
  ScorePill,
  SegmentedControl,
  Sheet,
  Sidebar,
  Slider,
  Stepper,
  TextArea,
  TextField,
  ToastProvider,
  Toggle,
  arrowOffset,
  useToast,
} from '.'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('Button', () => {
  it('is a real button with its variant, and loading disables it', () => {
    const onClick = vi.fn()
    const { rerender } = render(
      <Button variant="primary" onClick={onClick}>
        Start
      </Button>,
    )
    const button = screen.getByRole('button', { name: 'Start' })
    expect(button.className).toContain('atl-button--primary')
    expect(button.getAttribute('type')).toBe('button')
    fireEvent.click(button)
    expect(onClick).toHaveBeenCalledTimes(1)
    rerender(
      <Button variant="primary" onClick={onClick} loading>
        Start
      </Button>,
    )
    expect(button).toHaveProperty('disabled', true)
    expect(button.getAttribute('aria-busy')).toBe('true')
  })
})

function Segments() {
  const [value, setValue] = useState<'a' | 'b' | 'c'>('a')
  return (
    <SegmentedControl
      label="Pick"
      value={value}
      onChange={setValue}
      options={[
        { value: 'a', label: 'Alpha' },
        { value: 'b', label: 'Beta' },
        { value: 'c', label: 'Gamma' },
      ]}
    />
  )
}

describe('SegmentedControl', () => {
  it('is a radio group with roving focus and arrow keys', () => {
    render(<Segments />)
    expect(screen.getByRole('radiogroup', { name: 'Pick' })).toBeTruthy()
    const [alpha, beta, gamma] = screen.getAllByRole('radio')
    expect(alpha?.getAttribute('aria-checked')).toBe('true')
    expect(alpha?.tabIndex).toBe(0)
    expect(beta?.tabIndex).toBe(-1)
    fireEvent.keyDown(alpha as HTMLElement, { key: 'ArrowRight' })
    expect(screen.getByRole('radio', { name: 'Beta' }).getAttribute('aria-checked')).toBe('true')
    expect(document.activeElement).toBe(beta)
    fireEvent.keyDown(beta as HTMLElement, { key: 'End' })
    expect(gamma?.getAttribute('aria-checked')).toBe('true')
    fireEvent.keyDown(gamma as HTMLElement, { key: 'ArrowRight' })
    expect(alpha?.getAttribute('aria-checked')).toBe('true') // wraps
  })
})

describe('Toggle', () => {
  it('is a labelled switch', () => {
    function Harness() {
      const [on, setOn] = useState(false)
      return <Toggle checked={on} onChange={setOn} label="Keep computer awake" description="While screening" />
    }
    render(<Harness />)
    const toggle = screen.getByRole('switch', { name: 'Keep computer awake' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-checked')).toBe('true')
    expect(toggle.getAttribute('aria-describedby')).toBeTruthy()
  })
})

describe('Stepper', () => {
  function Harness({ step = 1, min = 0, max = 10 }: { step?: number; min?: number; max?: number }) {
    const [value, setValue] = useState(min === 0 ? 5 : min)
    return (
      <>
        <Stepper label="Minimum" value={value} onChange={setValue} min={min} max={max} step={step} />
        <output data-testid="value">{value}</output>
      </>
    )
  }

  it('steps with buttons and arrow keys and stops at the bounds', () => {
    render(<Harness />)
    const input = screen.getByRole('spinbutton', { name: 'Minimum' })
    fireEvent.click(screen.getByRole('button', { name: 'Increase Minimum' }))
    expect(screen.getByTestId('value').textContent).toBe('6')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByTestId('value').textContent).toBe('4')
    for (let i = 0; i < 20; i++) fireEvent.keyDown(input, { key: 'ArrowUp' })
    expect(screen.getByTestId('value').textContent).toBe('10')
    expect(screen.getByRole('button', { name: 'Increase Minimum' })).toHaveProperty('disabled', true)
  })

  it('shows changes made elsewhere at once and never writes a value back on blur', () => {
    const onChange = vi.fn()
    function Linked() {
      // Like Cutoffs: the score band and the stepper edit the same number.
      const [value, setValue] = useState(60)
      return (
        <>
          <button type="button" onClick={() => setValue((v) => v + 1)}>
            Band right
          </button>
          <Stepper label="Shortlist" value={value} onChange={onChange} max={100} />
        </>
      )
    }
    render(<Linked />)
    const input = screen.getByRole('spinbutton', { name: 'Shortlist' }) as HTMLInputElement
    fireEvent.focus(input)
    fireEvent.click(screen.getByRole('button', { name: 'Band right' }))
    fireEvent.click(screen.getByRole('button', { name: 'Band right' }))
    expect(input.value).toBe('62')
    fireEvent.blur(input)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('accepts typed values, clamps them, and keeps decimal steps exact', () => {
    render(<Harness step={0.1} />)
    const input = screen.getByRole('spinbutton', { name: 'Minimum' }) as HTMLInputElement
    expect(input.value).toBe('5.0')
    fireEvent.change(input, { target: { value: '7,35' } })
    fireEvent.blur(input)
    expect(screen.getByTestId('value').textContent).toBe('7.3')
    fireEvent.change(input, { target: { value: '99' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input.value).toBe('10.0')
    fireEvent.change(input, { target: { value: 'abc' } })
    fireEvent.blur(input)
    expect(input.value).toBe('10.0')
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    fireEvent.keyDown(input, { key: 'ArrowDown' })
    expect(screen.getByTestId('value').textContent).toBe('9.7')
  })
})

describe('Slider', () => {
  it('is a labelled range with a readable value', () => {
    const onChange = vi.fn()
    render(
      <Slider
        label="Shortlist score"
        value={60}
        onChange={onChange}
        format={(v) => `${v} points`}
        ticks={[0, 50, 100]}
      />,
    )
    const slider = screen.getByRole('slider', { name: 'Shortlist score' })
    expect(slider.getAttribute('aria-valuetext')).toBe('60 points')
    fireEvent.change(slider, { target: { value: '72' } })
    expect(onChange).toHaveBeenCalledWith(72)
  })
})

describe('TextField and TextArea', () => {
  it('connect label, hint and error', () => {
    render(<TextField label="Screening name" value="" onChange={() => undefined} error="Give the screening a name." />)
    const input = screen.getByLabelText('Screening name')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    const describedBy = input.getAttribute('aria-describedby') ?? ''
    expect(document.getElementById(describedBy)?.textContent).toBe('Give the screening a name.')
  })

  it('counts characters', () => {
    render(<TextArea label="Criteria" value="Python" onChange={() => undefined} counter maxLength={8000} />)
    expect(screen.getByText(/6\s*\/\s*8,000 characters/)).toBeTruthy()
  })
})

describe('feedback', () => {
  it('score pills say the score and the bucket', () => {
    render(<ScorePill score={82} bucket="shortlisted" />)
    const pill = screen.getByRole('img', { name: 'Score 82, Shortlisted' })
    expect(pill.textContent).toBe('82')
    expect(pill.className).toContain('atl-pill--shortlisted')
  })

  it('progress ring and bar report their values', () => {
    render(
      <>
        <ProgressRing value={1.7} label="Screening progress" valueText="all done" />
        <ProgressBar value={0.256} label="Downloading" />
        <ProgressBar label="Testing" />
      </>,
    )
    expect(screen.getByRole('progressbar', { name: 'Screening progress' }).getAttribute('aria-valuenow')).toBe('100')
    expect(screen.getByRole('progressbar', { name: 'Downloading' }).getAttribute('aria-valuenow')).toBe('26')
    expect(screen.getByRole('progressbar', { name: 'Testing' }).getAttribute('aria-valuenow')).toBeNull()
  })

  it('an error banner is an alert; others are status', () => {
    const onClick = vi.fn()
    render(
      <>
        <Banner tone="error" title="Disk is full" action={{ label: 'Resume', onClick }} />
        <Banner tone="info" title="Rough estimate" />
      </>,
    )
    expect(screen.getByRole('alert').textContent).toContain('Disk is full')
    expect(screen.getByRole('status').textContent).toContain('Rough estimate')
    fireEvent.click(screen.getByRole('button', { name: 'Resume' }))
    expect(onClick).toHaveBeenCalled()
  })

  it('toasts appear and dismiss themselves', async () => {
    function Harness() {
      const toast = useToast()
      return (
        <Button onClick={() => toast({ message: 'Exported 12 candidates', icon: CheckCircle2, duration: 60 })}>
          Go
        </Button>
      )
    }
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Go' }))
    expect(screen.getByText('Exported 12 candidates')).toBeTruthy()
    // Real timers: the exit is a spring driven by animation frames.
    await waitFor(() => expect(screen.queryByText('Exported 12 candidates')).toBeNull(), { timeout: 3000 })
  })
})

describe('navigation and lists', () => {
  it('the sidebar marks the current page', () => {
    const onSelect = vi.fn()
    render(
      <Sidebar
        label="Buckets"
        selected="b"
        onSelect={onSelect}
        sections={[
          {
            items: [
              { id: 'a', label: 'Shortlisted', icon: CheckCircle2, count: 1200 },
              { id: 'b', label: 'Cutoff', icon: CheckCircle2, count: 3 },
            ],
          },
        ]}
      />,
    )
    expect(screen.getByRole('navigation', { name: 'Buckets' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Cutoff/ }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByText('1,200')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Shortlisted/ }))
    expect(onSelect).toHaveBeenCalledWith('a')
  })

  it('a choice list is a radio group', () => {
    render(
      <List label="Models" choice>
        <ListRow title="qwen3:8b" selectable selected onClick={() => undefined} />
        <ListRow title="qwen3:4b" selectable onClick={() => undefined} />
      </List>,
    )
    expect(screen.getByRole('radiogroup', { name: 'Models' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: /qwen3:8b/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: /qwen3:4b/ }).getAttribute('aria-checked')).toBe('false')
  })
})

describe('overlays', () => {
  function SheetHarness({ onClose }: { onClose: () => void }) {
    return (
      <>
        <div id="root">
          <button type="button">Opener</button>
        </div>
        <Sheet open onClose={onClose} title="Export results" footer={<Button>Export…</Button>}>
          <button type="button">Inside</button>
        </Sheet>
      </>
    )
  }

  it('a sheet is a labelled modal dialog; Esc closes it; the page behind is inert', async () => {
    const onClose = vi.fn()
    render(<SheetHarness onClose={onClose} />)
    const dialog = screen.getByRole('dialog', { name: 'Export results' })
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(document.getElementById('root')?.hasAttribute('inert')).toBe(true)
    await act(async () => {
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
    })
    expect(dialog.contains(document.activeElement)).toBe(true)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('only the top-most modal answers Esc', () => {
    const closeSheet = vi.fn()
    const cancelAlert = vi.fn()
    render(
      <>
        <Sheet open onClose={closeSheet} title="Sheet">
          <p>Body</p>
        </Sheet>
        <Alert
          open
          title="Sure?"
          actions={[{ label: 'Yes', onClick: () => undefined }]}
          cancel={{ label: 'No', onClick: cancelAlert }}
        />
      </>,
    )
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(cancelAlert).toHaveBeenCalledTimes(1)
    expect(closeSheet).not.toHaveBeenCalled()
    expect(screen.getByRole('alertdialog', { name: 'Sure?' })).toBeTruthy()
  })
})

describe('Popover', () => {
  it('has an arrow that points at the middle of the button, clear of the rounded corners', () => {
    // A 130-px button whose right edge is the popover's right edge (align end): 65 px in, minus half the arrow.
    expect(arrowOffset({ left: 870, width: 130 }, 1000, 'end', 480)).toBe(55)
    expect(arrowOffset({ left: 100, width: 40 }, 100, 'start', 300)).toBe(10)
    expect(arrowOffset({ left: 996, width: 4 }, 1000, 'end', 480)).toBe(6) // never into the corner
    expect(arrowOffset({ left: 380, width: 40 }, 1000, 'end', 300)).toBe(274) // nor past the far one

    function Harness() {
      const anchor = useRef<HTMLButtonElement>(null)
      return (
        <>
          <Button ref={anchor}>Adjust cutoffs</Button>
          <Popover open onClose={() => {}} anchor={anchor} label="Adjust cutoffs">
            <p>Cutoffs</p>
          </Popover>
        </>
      )
    }
    render(<Harness />)
    const pop = screen.getByRole('dialog', { name: 'Adjust cutoffs' })
    expect(pop.querySelector('.atl-popover-arrow')).not.toBeNull()
  })
})
