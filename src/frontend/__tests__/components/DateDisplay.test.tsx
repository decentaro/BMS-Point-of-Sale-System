import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'

vi.mock('@/utils/dateFormat', () => ({
  formatDateSync: (_d: any) => '15/03/2025',
  formatTime: (_d: any) => '14:30:00',
}))

import { DateDisplay } from '@/components/DateDisplay'

describe('DateDisplay', () => {
  it('renders the formatted date for a Date object', () => {
    render(<DateDisplay date={new Date('2025-03-15T14:30:00Z')} />)
    expect(screen.getByText('15/03/2025')).toBeTruthy()
  })

  it('renders the formatted date for a date string', () => {
    render(<DateDisplay date="2025-03-15T14:30:00Z" />)
    expect(screen.getByText('15/03/2025')).toBeTruthy()
  })

  it('shows fallback "—" when date is null', () => {
    render(<DateDisplay date={null} />)
    expect(screen.getByText('—')).toBeTruthy()
  })

  it('shows custom fallback when date is null', () => {
    render(<DateDisplay date={null} fallback="N/A" />)
    expect(screen.getByText('N/A')).toBeTruthy()
  })

  it('includes time when includeTime=true', () => {
    render(<DateDisplay date={new Date()} includeTime />)
    expect(screen.getByText('15/03/2025, 14:30:00')).toBeTruthy()
  })

  it('omits time by default', () => {
    render(<DateDisplay date={new Date()} />)
    expect(screen.queryByText(/14:30:00/)).toBeNull()
  })

  it('applies className to the span', () => {
    const { container } = render(<DateDisplay date={new Date()} className="text-red-600" />)
    expect((container.firstChild as HTMLElement).className).toContain('text-red-600')
  })

  it('renders as a <span> element', () => {
    const { container } = render(<DateDisplay date={new Date()} />)
    expect(container.firstChild?.nodeName).toBe('SPAN')
  })
})
