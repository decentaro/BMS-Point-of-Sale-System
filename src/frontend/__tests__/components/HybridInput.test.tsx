import { describe, it, expect, vi } from 'vitest'
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react'

import HybridInput from '@/components/HybridInput'

function setup(props: Partial<Parameters<typeof HybridInput>[0]> = {}) {
  const onChange = vi.fn()
  const onTouchKeyboard = vi.fn()
  const utils = render(
    <HybridInput
      value={props.value ?? ''}
      onChange={props.onChange ?? onChange}
      onTouchKeyboard={props.onTouchKeyboard ?? onTouchKeyboard}
      placeholder={props.placeholder}
      className={props.className}
      type={props.type}
      disabled={props.disabled}
      readOnly={props.readOnly}
      onEnter={props.onEnter}
      onBlur={props.onBlur}
    />
  )
  const input = utils.container.querySelector('input')!
  return { input, onChange, onTouchKeyboard, ...utils }
}

describe('HybridInput', () => {
  describe('Rendering', () => {
    it('renders an input element', () => {
      const { input } = setup()
      expect(input).toBeTruthy()
    })

    it('shows placeholder text', () => {
      setup({ placeholder: 'Type here' })
      expect(screen.getByPlaceholderText('Type here')).toBeTruthy()
    })

    it('displays the value', () => {
      const { input } = setup({ value: 'hello' })
      expect(input.value).toBe('hello')
    })

    it('applies className', () => {
      const { input } = setup({ className: 'my-class' })
      expect(input.className).toContain('my-class')
    })

    it('is disabled when disabled=true', () => {
      const { input } = setup({ disabled: true })
      expect(input.disabled).toBe(true)
    })

    it('is readOnly when readOnly=true', () => {
      const { input } = setup({ readOnly: true })
      expect(input.readOnly).toBe(true)
    })
  })

  describe('Text input', () => {
    it('calls onChange with new text value', () => {
      const { input, onChange } = setup()
      fireEvent.change(input, { target: { value: 'hello world' } })
      expect(onChange).toHaveBeenCalledWith('hello world')
    })
  })

  describe('Number input type', () => {
    it('strips non-numeric characters', () => {
      const { input, onChange } = setup({ type: 'number' })
      fireEvent.change(input, { target: { value: 'abc123def' } })
      expect(onChange).toHaveBeenCalledWith('123')
    })

    it('allows digit-only input', () => {
      const { input, onChange } = setup({ type: 'number' })
      fireEvent.change(input, { target: { value: '456' } })
      expect(onChange).toHaveBeenCalledWith('456')
    })
  })

  describe('Decimal input type', () => {
    it('allows numeric decimal input', () => {
      const { input, onChange } = setup({ type: 'decimal' })
      fireEvent.change(input, { target: { value: '12.50' } })
      expect(onChange).toHaveBeenCalledWith('12.50')
    })

    it('strips non-numeric, non-decimal characters', () => {
      const { input, onChange } = setup({ type: 'decimal' })
      fireEvent.change(input, { target: { value: 'abc' } })
      expect(onChange).toHaveBeenCalledWith('')
    })

    it('adds leading zero when starting with decimal point', () => {
      const { input, onChange } = setup({ type: 'decimal' })
      fireEvent.change(input, { target: { value: '.5' } })
      expect(onChange).toHaveBeenCalledWith('0.5')
    })

    it('allows only one decimal point', () => {
      const { input, onChange } = setup({ type: 'decimal' })
      fireEvent.change(input, { target: { value: '1.2.3' } })
      // Parts: ['1', '2', '3'] → '1' + '.' + '23'
      expect(onChange).toHaveBeenCalledWith('1.23')
    })
  })

  describe('Touch keyboard', () => {
    it('calls onTouchKeyboard when clicked', () => {
      const { input, onTouchKeyboard } = setup()
      fireEvent.click(input)
      expect(onTouchKeyboard).toHaveBeenCalledTimes(1)
    })
  })

  describe('Enter key', () => {
    it('calls onEnter when Enter is pressed', () => {
      const onEnter = vi.fn()
      const { input } = setup({ onEnter })
      fireEvent.keyDown(input, { key: 'Enter' })
      expect(onEnter).toHaveBeenCalledTimes(1)
    })

    it('does not throw when no onEnter provided and Enter pressed', () => {
      const { input } = setup()
      expect(() => fireEvent.keyDown(input, { key: 'Enter' })).not.toThrow()
    })
  })

  describe('Blur', () => {
    it('calls onBlur when input loses focus', () => {
      const onBlur = vi.fn()
      const { input } = setup({ onBlur })
      fireEvent.blur(input)
      expect(onBlur).toHaveBeenCalledTimes(1)
    })
  })
})
