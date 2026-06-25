import { describe, it, expect } from 'vitest'
import { composeFileReply, type FileReplyInput } from './compose-reply'

function input(over: Partial<FileReplyInput> = {}): FileReplyInput {
  return { scenario: 'updates', displayName: 'Catering quote', fileName: 'catering.pdf', ...over }
}

describe('composeFileReply', () => {
  it('failed: names the file, says it is saved as a source, applies nothing', () => {
    const reply = composeFileReply(input({ scenario: 'failed' }))
    expect(reply).toContain('**Catering quote**')
    expect(reply).toContain('trouble reading it')
    expect(reply).toContain('_Nothing applied yet._')
  })

  it('low_confidence: keeps it as a source, nothing to review', () => {
    const reply = composeFileReply(input({ scenario: 'low_confidence' }))
    expect(reply).toContain('kept it as a source')
    expect(reply).not.toContain('Ready to review')
  })

  it('no_updates: stored as a source, no plan change', () => {
    const reply = composeFileReply(input({ scenario: 'no_updates' }))
    expect(reply).toContain("didn't find anything that needs a plan change")
  })

  it('updates: singular count phrasing for one item', () => {
    const reply = composeFileReply(input({ ready: [{ type: 'task', label: 'Confirm menu' }] }))
    expect(reply).toContain('**1 update**')
    expect(reply).not.toContain('**1 updates**')
  })

  it('updates: plural count sums ready + needsConfirmation + removals', () => {
    const reply = composeFileReply(
      input({
        ready: [{ type: 'task', label: 'Confirm menu' }],
        needsConfirmation: ['Is the deposit paid?'],
        removals: [{ type: 'vendor', label: 'Old caterer' }],
      }),
    )
    expect(reply).toContain('**3 updates**')
  })

  it('updates: renders each section with type-labelled bullets', () => {
    const reply = composeFileReply(
      input({
        ready: [{ type: 'budget_item', label: 'Catering $4,000' }],
        removals: [{ type: 'vendor', label: 'Old caterer' }],
        needsConfirmation: ['Final headcount?'],
      }),
    )
    expect(reply).toContain('**Ready to review**')
    expect(reply).toContain('- Budget: Catering $4,000')
    expect(reply).toContain('**Removals to confirm**')
    expect(reply).toContain('- Vendor: Old caterer')
    expect(reply).toContain('**Needs your confirmation**')
    expect(reply).toContain('- Final headcount?')
    expect(reply).toContain('**Stored in Event Library** · catering.pdf')
    expect(reply).toContain('_Nothing applied yet._')
  })

  it('updates: omits empty sections', () => {
    const reply = composeFileReply(input({ ready: [{ type: 'task', label: 'Confirm menu' }] }))
    expect(reply).not.toContain('Removals to confirm')
    expect(reply).not.toContain('Needs your confirmation')
  })
})
