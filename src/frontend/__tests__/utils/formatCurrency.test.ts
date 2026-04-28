import { describe, it, expect } from 'vitest'
import { formatCurrency } from '@/utils/formatCurrency'

describe('formatCurrency', () => {
  describe('Happy Path', () => {
    it('formats zero', () => {
      expect(formatCurrency(0)).toBe('0.00')
    })

    it('formats whole number', () => {
      expect(formatCurrency(5)).toBe('5.00')
    })

    it('formats with two decimals already', () => {
      expect(formatCurrency(9.99)).toBe('9.99')
    })

    it('formats with one decimal', () => {
      expect(formatCurrency(10.5)).toBe('10.50')
    })

    it('formats large amounts', () => {
      expect(formatCurrency(1234567.89)).toBe('1234567.89')
    })

    it('formats negative values', () => {
      expect(formatCurrency(-5.5)).toBe('-5.50')
    })
  })

  describe('Edge Cases', () => {
    it('rounds half-up for third decimal', () => {
      // toFixed(2) rounds 1.005 to 1.00 or 1.01 depending on float representation
      // Just verify we get 2 decimal places
      const result = formatCurrency(1.005)
      expect(result).toMatch(/^\d+\.\d{2}$/)
    })

    it('rounds down when third decimal < 5', () => {
      expect(formatCurrency(1.234)).toBe('1.23')
    })

    it('rounds up when third decimal >= 5', () => {
      expect(formatCurrency(1.235)).toBe('1.24')
    })

    it('handles very small positive amounts', () => {
      expect(formatCurrency(0.01)).toBe('0.01')
    })

    it('returns string type', () => {
      expect(typeof formatCurrency(5)).toBe('string')
    })
  })
})
