import type { MenuItemConstructorOptions } from 'electron'
import { describe, expect, it, vi } from 'vitest'
import type { RowMenuChoice, RowMenuRequest } from '@shared/bridge'
import { menuLabel, rowMenuTemplate } from './menus'

type Item = MenuItemConstructorOptions

function labels(items: Item[]): string[] {
  return items.map((item) => (item.type === 'separator' ? '—' : String(item.label)))
}

function click(item: Item | undefined): void {
  ;(item?.click as unknown as () => void)()
}

function build(request: RowMenuRequest, platform = 'win32', copyResult: Promise<void> = Promise.resolve()) {
  const choose = vi.fn<(choice: RowMenuChoice) => void>()
  const copy = vi.fn<(text: string) => Promise<void>>(() => copyResult)
  return { items: rowMenuTemplate(request, platform, choose, copy), choose, copy }
}

describe('rowMenuTemplate', () => {
  it('one scored row: details, move to the other buckets, copy its RA number', async () => {
    const { items, choose, copy } = build({
      raNumbers: ['RA2311000003'],
      moveTargets: ['cutoff', 'rejected'],
      details: true,
    })
    expect(labels(items)).toEqual(['Show details', '—', 'Move to', 'Copy RA number'])
    const submenu = items[2]?.submenu as Item[]
    expect(labels(submenu)).toEqual(['Cutoff…', 'Rejected…'])
    click(submenu[1])
    expect(choose).toHaveBeenLastCalledWith({ action: 'move', to: 'rejected' })
    click(items[3])
    expect(copy).toHaveBeenCalledWith('RA2311000003')
    await vi.waitFor(() => expect(choose).toHaveBeenLastCalledWith({ action: 'copied' }))
    click(items[0])
    expect(choose).toHaveBeenLastCalledWith({ action: 'details' })
  })

  it('several rows: the counts are in the labels, one RA number per line, no details', () => {
    const { items, copy } = build({ raNumbers: ['RA1', 'RA2', 'RA3'], moveTargets: ['shortlisted'], details: true })
    expect(labels(items)).toEqual(['Move 3 candidates to', 'Copy 3 RA numbers'])
    click(items[1])
    expect(copy).toHaveBeenCalledWith('RA1\nRA2\nRA3')
  })

  it('says "copied" only when the clipboard has the text, and says so plainly when it refuses', async () => {
    let finish: () => void = () => undefined
    const slow = build(
      { raNumbers: ['RA1'], moveTargets: [], details: false },
      'win32',
      new Promise((r) => (finish = r)),
    )
    click(slow.items[0])
    await Promise.resolve()
    expect(slow.choose).not.toHaveBeenCalled()
    finish()
    await vi.waitFor(() => expect(slow.choose).toHaveBeenCalledWith({ action: 'copied' }))

    const refused = Promise.reject(new Error('clipboard busy'))
    refused.catch(() => undefined)
    const one = build({ raNumbers: ['RA1'], moveTargets: [], details: false }, 'win32', refused)
    click(one.items[0])
    await vi.waitFor(() =>
      expect(one.choose).toHaveBeenCalledWith({
        action: 'copy_failed',
        message: "Couldn't copy the RA number. Try again in a moment.",
      }),
    )
    const three = build({ raNumbers: ['RA1', 'RA2', 'RA3'], moveTargets: [], details: false }, 'win32', refused)
    click(three.items[0])
    await vi.waitFor(() =>
      expect(three.choose).toHaveBeenCalledWith({
        action: 'copy_failed',
        message: "Couldn't copy the 3 RA numbers. Try again in a moment.",
      }),
    )
  })

  it('rows that were not scored can only be copied', () => {
    const { items } = build({ raNumbers: ['RA1'], moveTargets: [], details: false })
    expect(labels(items)).toEqual(['Copy RA number'])
  })

  it('title case on macOS, sentence case elsewhere', () => {
    const { items } = build({ raNumbers: ['RA1', 'RA2'], moveTargets: ['cutoff'], details: true }, 'darwin')
    expect(labels(items)).toEqual(['Move 2 Candidates to', 'Copy 2 RA Numbers'])
    expect(menuLabel('Show details', 'darwin')).toBe('Show Details')
    expect(menuLabel('Show details', 'win32')).toBe('Show details')
  })
})
