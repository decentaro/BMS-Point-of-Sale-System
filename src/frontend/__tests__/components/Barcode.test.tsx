import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen } from '@testing-library/react'

// Mock JsBarcode to avoid canvas rendering issues in jsdom
vi.mock('jsbarcode', () => ({
  default: vi.fn(),
}))

import Barcode from '@/components/Barcode'
import JsBarcode from 'jsbarcode'

describe('Barcode', () => {
  it('renders a canvas element when value is provided', () => {
    const { container } = render(<Barcode value="123456789" />)
    expect(container.querySelector('canvas')).toBeTruthy()
  })

  it('returns null when value is empty string', () => {
    const { container } = render(<Barcode value="" />)
    expect(container.firstChild).toBeNull()
  })

  it('calls JsBarcode with the provided value', () => {
    render(<Barcode value="BARCODE123" />)
    expect(JsBarcode).toHaveBeenCalledWith(
      expect.any(Object), // canvas ref
      'BARCODE123',
      expect.objectContaining({ format: 'CODE128' })
    )
  })

  it('passes custom width and height to JsBarcode', () => {
    render(<Barcode value="ABC" width={2} height={60} />)
    expect(JsBarcode).toHaveBeenCalledWith(
      expect.any(Object),
      'ABC',
      expect.objectContaining({ width: 2, height: 60 })
    )
  })

  it('passes displayValue=false to JsBarcode when specified', () => {
    render(<Barcode value="XYZ" displayValue={false} />)
    expect(JsBarcode).toHaveBeenCalledWith(
      expect.any(Object),
      'XYZ',
      expect.objectContaining({ displayValue: false })
    )
  })

  it('applies className to wrapper div', () => {
    const { container } = render(<Barcode value="123" className="my-class" />)
    expect(container.firstChild?.nodeName).toBe('DIV')
    expect((container.firstChild as HTMLElement).className).toContain('my-class')
  })

  it('does not crash when JsBarcode throws', () => {
    vi.mocked(JsBarcode).mockImplementationOnce(() => { throw new Error('canvas error') })
    const { container } = render(<Barcode value="FAIL" />)
    // Should still render the canvas (error caught internally)
    expect(container.querySelector('canvas')).toBeTruthy()
  })
})
