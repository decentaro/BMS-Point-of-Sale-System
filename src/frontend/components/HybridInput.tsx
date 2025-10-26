import React from 'react'

interface HybridInputProps {
  value: string
  onChange: (value: string) => void
  onTouchKeyboard: () => void
  placeholder?: string
  className?: string
  type?: 'text' | 'number' | 'decimal'
  disabled?: boolean
  readOnly?: boolean
  onEnter?: () => void
  onBlur?: () => void
}

/**
 * HybridInput - Simple input that supports both hardware keyboard and touch keyboard
 * 
 * Behavior:
 * - Always allows hardware keyboard typing
 * - Click opens touch keyboard modal
 * - No complex detection - just works
 */
const HybridInput: React.FC<HybridInputProps> = ({
  value,
  onChange,
  onTouchKeyboard,
  placeholder,
  className = '',
  type = 'text',
  disabled = false,
  readOnly = false,
  onEnter,
  onBlur
}) => {
  // Handle direct typing (hardware keyboard)
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let newValue = e.target.value

    // Apply type-specific validation
    if (type === 'number') {
      newValue = newValue.replace(/[^0-9]/g, '')
    } else if (type === 'decimal') {
      // Allow numbers, one decimal point, and ensure proper format
      newValue = newValue.replace(/[^0-9.]/g, '')
      
      // Only allow one decimal point
      const parts = newValue.split('.')
      if (parts.length > 2) {
        newValue = parts[0] + '.' + parts.slice(1).join('')
      }
      
      // Prevent starting with decimal point - add leading zero
      if (newValue.startsWith('.')) {
        newValue = '0' + newValue
      }
      
      // Prevent multiple leading zeros (except for 0.x)
      if (newValue.match(/^00+/) && !newValue.startsWith('0.')) {
        newValue = newValue.replace(/^0+/, '0')
      }
    }

    onChange(newValue)
  }

  // Handle click/touch - opens modal keyboard but allows focus
  const handleClick = (e: React.MouseEvent<HTMLInputElement>) => {
    // Always open the modal keyboard
    onTouchKeyboard()
  }

  // Handle keyboard events
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && onEnter) {
      onEnter()
    }
  }

  // Handle blur events
  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (onBlur) {
      onBlur()
    }
  }

  // Ensure input can always be focused for keyboard typing
  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    // Input is now focused and ready for keyboard typing
  }

  return (
    <input
      type="text"
      value={value}
      onChange={handleChange}
      onClick={handleClick}
      onFocus={handleFocus}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      placeholder={placeholder}
      className={className}
      disabled={disabled}
      readOnly={readOnly}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
    />
  )
}

export default HybridInput