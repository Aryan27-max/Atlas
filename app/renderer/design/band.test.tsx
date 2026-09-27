// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { type Band, Chip, ScoreBand } from '.'

afterEach(cleanup)

function Harness({ start = { shortlist: 60, band: 50 } }: { start?: Band }) {
  const [value, setValue] = useState(start)
  return (
    <>
      <ScoreBand value={value} onChange={setValue} />
      <output data-testid="value">{`${value.band}-${value.shortlist}`}</output>
    </>
  )
}

describe('ScoreBand', () => {
  it('has two labelled slider handles with their values', () => {
    render(<Harness />)
    expect(screen.getByRole('group', { name: 'Score bands' })).toBeTruthy()
    const shortlist = screen.getByRole('slider', { name: 'Shortlist score' })
    const band = screen.getByRole('slider', { name: 'Cutoff band starts at' })
    expect(shortlist.getAttribute('aria-valuenow')).toBe('60')
    expect(band.getAttribute('aria-valuenow')).toBe('50')
    expect(shortlist.tabIndex).toBe(0)
    expect(screen.getByText('Rejected')).toBeTruthy()
    expect(screen.getByText('Cutoff')).toBeTruthy()
    expect(screen.getByText('Shortlisted')).toBeTruthy()
  })

  it('moves with the keyboard and the handles never cross', () => {
    render(<Harness />)
    const shortlist = screen.getByRole('slider', { name: 'Shortlist score' })
    const band = screen.getByRole('slider', { name: 'Cutoff band starts at' })
    fireEvent.keyDown(shortlist, { key: 'ArrowRight' })
    fireEvent.keyDown(shortlist, { key: 'PageUp' })
    expect(screen.getByTestId('value').textContent).toBe('50-71')
    fireEvent.keyDown(band, { key: 'End' })
    expect(screen.getByTestId('value').textContent).toBe('71-71')
    fireEvent.keyDown(shortlist, { key: 'Home' })
    expect(screen.getByTestId('value').textContent).toBe('71-71')
    fireEvent.keyDown(band, { key: 'Home' })
    fireEvent.keyDown(shortlist, { key: 'End' })
    expect(screen.getByTestId('value').textContent).toBe('0-100')
    fireEvent.keyDown(shortlist, { key: 'ArrowUp' })
    expect(screen.getByTestId('value').textContent).toBe('0-100')
  })

  it('hides a zone label when the zone is too narrow to hold it', () => {
    render(<Harness start={{ shortlist: 55, band: 52 }} />)
    expect(screen.queryByText('Cutoff')).toBeNull()
  })
})

describe('Chip', () => {
  it('is a toggle button', () => {
    let pressed = false
    const { rerender } = render(
      <Chip pressed={pressed} onClick={() => (pressed = !pressed)}>
        CSE
      </Chip>,
    )
    const chip = screen.getByRole('button', { name: 'CSE' })
    expect(chip.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(chip)
    rerender(
      <Chip pressed={pressed} onClick={() => undefined}>
        CSE
      </Chip>,
    )
    expect(chip.getAttribute('aria-pressed')).toBe('true')
  })
})
