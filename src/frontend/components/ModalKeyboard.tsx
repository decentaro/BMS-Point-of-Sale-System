import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useKeyboardSound } from '../utils/useKeyboardSound'

export type KeyboardType = 'numeric' | 'qwerty' | 'decimal'

// Shift states: off → shifted (one-shot) → capsLocked (sticky) → off
type ShiftState = 'off' | 'shifted' | 'capsLocked'

type ModalKeyboardProps = {
  open: boolean
  type: KeyboardType
  title?: string
  initialValue?: string
  masked?: boolean
  onSubmit: (value: string) => void
  onClose: () => void
}

const KeyButton: React.FC<{
  children: React.ReactNode
  onClick?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  variant?: 'default' | 'danger' | 'primary' | 'ghost' | 'special'
  className?: string
}> = ({ children, onClick, onContextMenu, variant = 'default', className }) => {
  const base = 'h-12 rounded-[10px] text-[17px] font-normal transition-all duration-75 select-none active:scale-[0.97] active:brightness-90'
  const styles: Record<string, string> = {
    default: 'bg-white text-black shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_0_rgba(0,0,0,0.08)]',
    danger: 'bg-gray-700 hover:bg-gray-800 active:bg-gray-900 text-white shadow-[0_1px_3px_rgba(0,0,0,0.2)]',
    primary: 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white shadow-[0_1px_3px_rgba(0,0,0,0.2)]',
    ghost: 'bg-[#AEB3BE] text-black shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_0_rgba(0,0,0,0.08)]',
    special: 'bg-[#AEB3BE] text-black shadow-[0_1px_3px_rgba(0,0,0,0.12),0_1px_0_rgba(0,0,0,0.08)]',
  }
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      // Prevent on-screen keys from stealing focus away from the input field,
      // so physical keyboard continues working seamlessly between taps
      onMouseDown={e => e.preventDefault()}
      onTouchStart={e => e.preventDefault()}
      className={[base, styles[variant], className].join(' ')}
    >
      {children}
    </button>
  )
}

export const ModalKeyboard: React.FC<ModalKeyboardProps> = ({ open, type, title, initialValue = '', masked = false, onSubmit, onClose }) => {
  const [value, setValue] = useState(initialValue)
  const [currentMode, setCurrentMode] = useState<KeyboardType>(type)
  const [shiftState, setShiftState] = useState<ShiftState>('off')
  const [symbolMode, setSymbolMode] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const cursorRef = useRef<number>(initialValue.length)
  const lastShiftTapRef = useRef<number>(0)
  const { playKeySound } = useKeyboardSound()

  const isUpperCase = shiftState !== 'off'

  // IMPORTANT: All hooks must come before any conditional returns
  useEffect(() => {
    if (open) {
      setValue(initialValue)
      cursorRef.current = initialValue.length
      setCurrentMode(type)
      setShiftState('off')
      // Auto-focus the input so physical keyboard works immediately
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, initialValue, type])

  // Physical keyboard support — works in ALL modes including masked
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Enter') { e.preventDefault(); onSubmit(value); return }

      // For masked mode, handle physical keyboard since input is readOnly
      if (masked) {
        e.preventDefault()
        if (e.key === 'Backspace') {
          setValue(v => v.slice(0, -1))
          cursorRef.current = Math.max(0, cursorRef.current - 1)
        } else if (e.key.length === 1) {
          setValue(v => v + e.key)
          cursorRef.current += 1
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose, onSubmit, value, masked])

  // After each value update, restore cursor position in the input
  useLayoutEffect(() => {
    if (!open || !inputRef.current || masked) return
    const pos = cursorRef.current
    inputRef.current.setSelectionRange(pos, pos)
  }, [open, value, masked])

  // Now safe to return early - all hooks called
  if (!open) return null

  const push = (ch: string) => {
    playKeySound()
    const isLetter = /^[a-zA-Z]$/.test(ch)
    const finalChar = isLetter && isUpperCase ? ch.toUpperCase() : ch
    const pos = cursorRef.current
    setValue(v => v.slice(0, pos) + finalChar + v.slice(pos))
    cursorRef.current = pos + finalChar.length
    // One-shot shift: revert after typing a character
    if (shiftState === 'shifted') setShiftState('off')
  }
  const backspace = () => {
    playKeySound()
    const pos = cursorRef.current
    if (pos === 0) return
    setValue(v => v.slice(0, pos - 1) + v.slice(pos))
    cursorRef.current = pos - 1
  }
  const submit = () => onSubmit(value)

  // Apple-style shift: single tap = one-shot shift, double-tap = caps lock
  const handleShift = () => {
    playKeySound()
    const now = Date.now()
    if (shiftState === 'shifted' && now - lastShiftTapRef.current < 400) {
      // Double-tap while shifted → caps lock
      setShiftState('capsLocked')
    } else if (shiftState === 'capsLocked') {
      // Tap while caps locked → turn off
      setShiftState('off')
    } else if (shiftState === 'shifted') {
      // Tap again (not double-tap) → turn off
      setShiftState('off')
    } else {
      // Tap from off → one-shot shift
      setShiftState('shifted')
    }
    lastShiftTapRef.current = now
  }

  // Shift icon: hollow arrow (off), filled arrow (shifted), underlined filled arrow (caps lock)
  const shiftIcon = shiftState === 'capsLocked'
    ? <span className="text-[15px]">⇪</span>
    : shiftState === 'shifted'
      ? <span className="text-[15px]">⬆</span>
      : <span className="text-[15px]">⇧</span>

  return (
    <div className="fixed inset-0 z-50">
      <div ref={backdropRef} className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div
        className="absolute bg-[#D1D3D9] rounded-t-2xl shadow-2xl overflow-auto bottom-0 left-0 right-0 max-h-[70vh] min-h-[300px] sm:min-h-[450px] p-3 sm:p-4 pb-6"
      >
        {/* Header bar */}
        <div className="flex items-center justify-between pb-2.5 px-1">
          <div className="text-sm font-medium text-gray-500 tracking-wide">{title || (type === 'decimal' ? 'Enter amount' : type === 'numeric' ? 'Enter number' : 'Enter text')}</div>
          <button type="button" className="w-7 h-7 rounded-full bg-gray-400/60 hover:bg-gray-400/80 text-gray-600 text-sm flex items-center justify-center transition-colors" onClick={onClose}>×</button>
        </div>

        {/* Input field */}
        <div className="mb-3 px-1">
          <input
            ref={inputRef}
            className="w-full h-11 px-4 text-lg bg-white border-0 rounded-xl shadow-[inset_0_1px_3px_rgba(0,0,0,0.08)] text-center focus:outline-none focus:ring-2 focus:ring-blue-400/50"
            value={masked ? '•'.repeat(value.length) : value}
            readOnly={masked}
            onChange={e => { if (!masked) { const pos = e.target.selectionStart ?? e.target.value.length; setValue(e.target.value); cursorRef.current = pos } }}
            onClick={e => { cursorRef.current = (e.target as HTMLInputElement).selectionStart ?? value.length }}
            onKeyUp={e => { cursorRef.current = (e.target as HTMLInputElement).selectionStart ?? value.length }}
            onFocus={e => { cursorRef.current = (e.target as HTMLInputElement).selectionStart ?? value.length }}
          />
        </div>

        {currentMode === 'decimal' ? (
          <div className="px-2 space-y-2">
            <div className="grid grid-cols-3 gap-[6px] max-w-sm mx-auto">
              {['1','2','3','4','5','6','7','8','9'].map((ch) => (
                <KeyButton key={ch} className="h-14 text-xl" onClick={() => push(ch)}>
                  {ch}
                </KeyButton>
              ))}
              <KeyButton className="h-14 text-xl" onClick={() => push('.')}>.</KeyButton>
              <KeyButton className="h-14 text-xl" onClick={() => push('0')}>0</KeyButton>
              <KeyButton variant="special" className="h-14 text-base" onClick={backspace}>⌫</KeyButton>
            </div>
            <div className="flex gap-[6px] mt-3">
              <KeyButton variant="danger" className="h-11 flex-1" onClick={onClose}>Cancel</KeyButton>
              <KeyButton variant="primary" className="h-11 flex-1" onClick={submit}>Done</KeyButton>
            </div>
          </div>
        ) : currentMode === 'numeric' ? (
          <div className="px-2 space-y-[6px]">
            {/* First row: numbers */}
            <div className="flex gap-[6px]">
              <KeyButton variant="special" className="h-11 w-12 sm:w-16 text-xs sm:text-sm">tab</KeyButton>
              {['1','2','3','4','5','6','7','8','9','0'].map((ch) => (
                <KeyButton key={ch} className="h-11 flex-1" onClick={() => push(ch)}>
                  {ch}
                </KeyButton>
              ))}
              <KeyButton variant="special" className="h-11 w-14 sm:w-20 text-xs sm:text-sm" onClick={backspace}>delete</KeyButton>
            </div>

            {/* Second row: symbols */}
            <div className="flex gap-[6px]">
              <KeyButton variant="special" className="h-11 w-16 sm:w-24 text-xs sm:text-sm">{symbolMode ? 'redo' : 'undo'}</KeyButton>
              {symbolMode ? (
                ['€','£','¥','-','^','[',']','{','}'].map((ch) => (
                  <KeyButton key={ch} className="h-11 flex-1" onClick={() => push(ch)}>
                    {ch}
                  </KeyButton>
                ))
              ) : (
                ['@','#','$','&','*','(',')','\'','"'].map((ch, idx) => {
                  const topSymbols = ['€','£','¥','-','^','[',']','{','}']
                  return (
                    <div key={ch} className="relative flex-1">
                      <KeyButton className="h-11 w-full" onClick={() => push(ch)}>
                        {ch}
                      </KeyButton>
                      <div className="absolute top-0.5 left-1/2 transform -translate-x-1/2 text-[10px] text-gray-400 pointer-events-none">
                        {topSymbols[idx]}
                      </div>
                    </div>
                  )
                })
              )}
              <KeyButton variant="primary" className="h-11 w-20 text-sm" onClick={submit}>return</KeyButton>
            </div>

            {/* Third row: more symbols */}
            <div className="flex gap-[6px]">
              <KeyButton
                variant="special"
                className="h-11 w-24 text-sm"
                onClick={() => {
                  playKeySound()
                  setSymbolMode(!symbolMode)
                }}
              >
                {symbolMode ? '123' : '#+='}
              </KeyButton>
              {symbolMode ? (
                ['|','~','…','\\','<','>','!','?'].map((ch, idx) => {
                  const bottomSymbols = ['-','+','=','/','.',':',',','.']
                  return (
                    <div key={ch} className="relative flex-1">
                      <KeyButton className="h-11 w-full" onClick={() => push(ch)}>
                        {ch}
                      </KeyButton>
                      <div className="absolute bottom-0.5 left-1/2 transform -translate-x-1/2 text-[10px] text-gray-400 pointer-events-none">
                        {bottomSymbols[idx]}
                      </div>
                    </div>
                  )
                })
              ) : (
                ['%','-','+','=','/','.',';','!','?'].map((ch, idx) => {
                  const topSymbols = ['§','_','…','\\','<','>',':',',','.']
                  return (
                    <div key={`${ch}-${idx}`} className="relative flex-1">
                      <KeyButton className="h-11 w-full" onClick={() => push(ch)}>
                        {ch}
                      </KeyButton>
                      <div className="absolute top-0.5 left-1/2 transform -translate-x-1/2 text-[10px] text-gray-400 pointer-events-none">
                        {topSymbols[idx]}
                      </div>
                    </div>
                  )
                })
              )}
              <KeyButton
                variant="special"
                className="h-11 w-24 text-sm"
                onClick={() => {
                  playKeySound()
                  setSymbolMode(!symbolMode)
                }}
              >
                {symbolMode ? '123' : '#+='}
              </KeyButton>
            </div>

            {/* Bottom row: ABC + space + ABC */}
            <div className="flex gap-[6px]">
              <KeyButton variant="special" className="h-11 w-20 text-sm" onClick={() => {
                playKeySound()
                setCurrentMode('qwerty')
              }}>ABC</KeyButton>
              <KeyButton className="h-11 flex-1" onClick={() => push(' ')}>space</KeyButton>
              <KeyButton variant="special" className="h-11 w-20 text-sm" onClick={() => {
                playKeySound()
                setCurrentMode('qwerty')
              }}>ABC</KeyButton>
            </div>
          </div>
        ) : (
          <div className="px-2 space-y-[6px]">
            {/* First row: q w e r t y u i o p */}
            <div className="flex gap-[6px] justify-center">
              {['Q','W','E','R','T','Y','U','I','O','P'].map((ch) => {
                const displayChar = isUpperCase ? ch : ch.toLowerCase()
                return (
                  <KeyButton key={ch} className="h-11 flex-1 min-w-0" onClick={() => push(displayChar)}>
                    {displayChar}
                  </KeyButton>
                )
              })}
            </div>

            {/* Second row: a s d f g h j k l (indented like Apple) */}
            <div className="flex gap-[6px] justify-center px-[5%]">
              {['A','S','D','F','G','H','J','K','L'].map((ch) => {
                const displayChar = isUpperCase ? ch : ch.toLowerCase()
                return (
                  <KeyButton key={ch} className="h-11 flex-1 min-w-0" onClick={() => push(displayChar)}>
                    {displayChar}
                  </KeyButton>
                )
              })}
            </div>

            {/* Third row: shift + z x c v b n m + delete */}
            <div className="flex gap-[6px]">
              <KeyButton
                variant={shiftState === 'capsLocked' ? 'primary' : shiftState === 'shifted' ? 'ghost' : 'special'}
                onClick={handleShift}
                className={`h-11 w-[12%] text-sm ${shiftState !== 'off' ? 'bg-white text-black shadow-[0_1px_3px_rgba(0,0,0,0.12)]' : ''}`}
              >
                {shiftIcon}
              </KeyButton>
              {['Z','X','C','V','B','N','M'].map((ch) => {
                const displayChar = isUpperCase ? ch : ch.toLowerCase()
                return (
                  <KeyButton key={ch} className="h-11 flex-1 min-w-0" onClick={() => push(displayChar)}>
                    {displayChar}
                  </KeyButton>
                )
              })}
              <KeyButton variant="special" className="h-11 w-[12%] text-sm" onClick={backspace}>
                ⌫
              </KeyButton>
            </div>

            {/* Bottom row: .?123 + space + return */}
            <div className="flex gap-[6px]">
              <KeyButton variant="special" className="h-11 w-[15%] text-sm" onClick={() => {
                playKeySound()
                setCurrentMode('numeric')
              }}>123</KeyButton>
              <KeyButton className="h-11 flex-1" onClick={() => push(' ')}>space</KeyButton>
              <KeyButton variant="primary" className="h-11 w-[20%] text-sm" onClick={submit}>return</KeyButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ModalKeyboard
