import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useKeyboardSound } from '../utils/useKeyboardSound'

export type KeyboardType = 'numeric' | 'qwerty' | 'decimal'

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
  const base = 'h-12 rounded-lg text-base font-normal transition-all duration-75 select-none shadow-sm active:scale-95'
  const styles: Record<string, string> = {
    default: 'bg-white hover:bg-gray-50 active:bg-gray-100 text-black shadow-[0_1px_0_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]',
    danger: 'bg-gray-700 hover:bg-gray-800 active:bg-gray-900 text-white shadow-[0_1px_0_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.1)]',
    primary: 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700 text-white shadow-[0_1px_0_rgba(0,0,0,0.2),inset_0_1px_0_rgba(255,255,255,0.2)]',
    ghost: 'bg-gray-300 hover:bg-gray-400 active:bg-gray-500 text-black shadow-[0_1px_0_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.3)]',
    special: 'bg-gray-300 hover:bg-gray-400 active:bg-gray-500 text-black shadow-[0_1px_0_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.3)]',
  }
  return (
    <button type="button" onClick={onClick} onContextMenu={onContextMenu} className={[base, styles[variant], className].join(' ')}>
      {children}
    </button>
  )
}

export const ModalKeyboard: React.FC<ModalKeyboardProps> = ({ open, type, title, initialValue = '', masked = false, onSubmit, onClose }) => {
  const [value, setValue] = useState(initialValue)
  const [currentMode, setCurrentMode] = useState<KeyboardType>(type)
  const [capsLock, setCapsLock] = useState(false)
  const [symbolMode, setSymbolMode] = useState(false)
  const backdropRef = useRef<HTMLDivElement>(null)
  const { playKeySound } = useKeyboardSound()

  // IMPORTANT: All hooks must come before any conditional returns
  const qwertyRows = useMemo(
    () => [
      ['1','2','3','4','5','6','7','8','9','0'],
      ['q','w','e','r','t','y','u','i','o','p'],
      ['a','s','d','f','g','h','j','k','l'],
      ['z','x','c','v','b','n','m'],
    ],
    []
  )

  const symbolsRow = useMemo(
    () => [',', '.', '?', '!', ';', ':', "'", '"', '-', '_', '(', ')', '@', '#', '$', '%', '&', '*', '+', '='],
    []
  )

  useEffect(() => {
    if (open) {
      setValue(initialValue)
      setCurrentMode(type) // Reset to original type when opening
      setCapsLock(false) // Reset caps lock when opening
    }
  }, [open, initialValue, type])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!open) return
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Now safe to return early - all hooks called
  if (!open) return null

  const push = (ch: string) => {
    playKeySound()
    // Only apply caps lock to letters, not numbers or symbols
    const isLetter = /^[a-zA-Z]$/.test(ch)
    const finalChar = isLetter && capsLock ? ch.toUpperCase() : ch
    setValue((v) => (v + finalChar))
  }
  const backspace = () => {
    playKeySound()
    setValue((v) => v.slice(0, -1))
  }
  const clear = () => {
    playKeySound()
    setValue('')
  }
  const submit = () => onSubmit(value)
  const toggleCapsLock = () => {
    playKeySound()
    setCapsLock(prev => !prev)
  }

  return (
    <div className="fixed inset-0 z-50">
      <div ref={backdropRef} className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="absolute bg-gray-100 rounded-t-2xl shadow-2xl overflow-auto bottom-0 left-0 right-0 max-h-[70vh] min-h-[300px] sm:min-h-[450px] p-4 sm:p-6 pb-8"
      >
        <div className="flex items-center justify-between pb-3 px-2">
          <div className="text-sm font-medium text-gray-600">{title || (type === 'decimal' ? 'Enter amount' : type === 'numeric' ? 'Enter number' : 'Enter text')}</div>
          <button type="button" className="w-6 h-6 rounded-full bg-gray-300 hover:bg-gray-400 text-gray-700 text-sm flex items-center justify-center" onClick={onClose}>×</button>
        </div>
        <div className="mb-4 px-2">
          <input className="w-full h-12 px-4 text-lg bg-white border-0 rounded-xl shadow-inner text-center" value={masked ? '•'.repeat(value.length) : value} readOnly />
        </div>
        {currentMode === 'decimal' ? (
          <div className="px-3 space-y-3">
            {/* Simple number pad for decimal input */}
            <div className="grid grid-cols-3 gap-3 max-w-sm mx-auto">
              {['1','2','3','4','5','6','7','8','9'].map((ch) => (
                <KeyButton key={ch} className="h-14 text-lg" onClick={() => push(ch)}>
                  {ch}
                </KeyButton>
              ))}
              <KeyButton className="h-14 text-lg" onClick={() => push('.')}>.</KeyButton>
              <KeyButton className="h-14 text-lg" onClick={() => push('0')}>0</KeyButton>
              <KeyButton variant="special" className="h-14 text-sm" onClick={backspace}>⌫</KeyButton>
            </div>
            <div className="flex gap-2 mt-4">
              <KeyButton variant="danger" className="h-12 flex-1" onClick={onClose}>Cancel</KeyButton>
              <KeyButton variant="primary" className="h-12 flex-1" onClick={submit}>Done</KeyButton>
            </div>
          </div>
        ) : currentMode === 'numeric' ? (
          <div className="px-3 space-y-3">
            {/* First row: numbers */}
            <div className="flex gap-2">
              <KeyButton variant="special" className="h-12 w-12 sm:w-16 text-xs sm:text-sm">tab</KeyButton>
              {['1','2','3','4','5','6','7','8','9','0'].map((ch) => (
                <KeyButton key={ch} className="h-12 flex-1" onClick={() => push(ch)}>
                  {ch}
                </KeyButton>
              ))}
              <KeyButton variant="special" className="h-12 w-14 sm:w-20 text-xs sm:text-sm" onClick={backspace}>delete</KeyButton>
            </div>

            {/* Second row: symbols */}
            <div className="flex gap-2">
              <KeyButton variant="special" className="h-12 w-16 sm:w-24 text-xs sm:text-sm">{symbolMode ? 'redo' : 'undo'}</KeyButton>
              {symbolMode ? (
                // Show top symbols when #+= is pressed (Image #1)
                ['€','£','¥','-','^','[',']','{','}'].map((ch) => (
                  <KeyButton key={ch} className="h-12 flex-1" onClick={() => push(ch)}>
                    {ch}
                  </KeyButton>
                ))
              ) : (
                // Show main symbols with currency hints above (Image #3)
                ['@','#','$','&','*','(',')','\'','"'].map((ch, idx) => {
                  const topSymbols = ['€','£','¥','-','^','[',']','{','}']
                  return (
                    <div key={ch} className="relative flex-1">
                      <KeyButton className="h-12 w-full" onClick={() => push(ch)}>
                        {ch}
                      </KeyButton>
                      <div className="absolute top-0.5 left-1/2 transform -translate-x-1/2 text-xs text-gray-400 pointer-events-none">
                        {topSymbols[idx]}
                      </div>
                    </div>
                  )
                })
              )}
              <KeyButton variant="primary" className="h-12 w-20 text-sm" onClick={submit}>return</KeyButton>
            </div>

            {/* Third row: more symbols */}
            <div className="flex gap-2">
              <KeyButton 
                variant="special" 
                className="h-12 w-24 text-sm"
                onClick={() => {
                  playKeySound()
                  setSymbolMode(!symbolMode)
                }}
              >
                {symbolMode ? '123' : '#+='}
              </KeyButton>
              {symbolMode ? (
                // Show additional symbols when #+= is pressed (Image #1)
                ['|','~','…','\\','<','>','!','?'].map((ch, idx) => {
                  const bottomSymbols = ['-','+','=','/','.',':',',','.']
                  return (
                    <div key={ch} className="relative flex-1">
                      <KeyButton className="h-12 w-full" onClick={() => push(ch)}>
                        {ch}
                      </KeyButton>
                      <div className="absolute bottom-0.5 left-1/2 transform -translate-x-1/2 text-xs text-gray-400 pointer-events-none">
                        {bottomSymbols[idx]}
                      </div>
                    </div>
                  )
                })
              ) : (
                // Show main punctuation with symbols above (Image #3)
                ['%','-','+','=','/','.',';','!','?'].map((ch, idx) => {
                  const topSymbols = ['§','_','…','\\','<','>',':',',','.']
                  return (
                    <div key={`${ch}-${idx}`} className="relative flex-1">
                      <KeyButton className="h-12 w-full" onClick={() => push(ch)}>
                        {ch}
                      </KeyButton>
                      <div className="absolute top-0.5 left-1/2 transform -translate-x-1/2 text-xs text-gray-400 pointer-events-none">
                        {topSymbols[idx]}
                      </div>
                    </div>
                  )
                })
              )}
              <KeyButton 
                variant="special" 
                className="h-12 w-24 text-sm"
                onClick={() => {
                  playKeySound()
                  setSymbolMode(!symbolMode)
                }}
              >
                {symbolMode ? '123' : '#+='}
              </KeyButton>
            </div>

            {/* Bottom row: ABC + space + ABC */}
            <div className="flex gap-2">
              <KeyButton variant="special" className="h-12 w-20 text-sm" onClick={() => {
                playKeySound()
                setCurrentMode('qwerty')
              }}>ABC</KeyButton>
              <KeyButton className="h-12 flex-1" onClick={() => push(' ')}></KeyButton>
              <KeyButton variant="special" className="h-12 w-20 text-sm" onClick={() => {
                playKeySound()
                setCurrentMode('qwerty')
              }}>ABC</KeyButton>
            </div>
          </div>
        ) : (
          <div className="px-3 space-y-3">
            {/* First row: tab + qwerty + delete */}
            <div className="flex gap-2">
              <KeyButton variant="special" className="h-12 w-16 text-sm">tab</KeyButton>
              {['Q','W','E','R','T','Y','U','I','O','P'].map((ch) => {
                const isLetter = /^[a-zA-Z]$/.test(ch)
                const displayChar = isLetter && !capsLock ? ch.toLowerCase() : ch
                return (
                  <KeyButton key={ch} className="h-12 flex-1" onClick={() => push(displayChar)}>
                    {displayChar}
                  </KeyButton>
                )
              })}
              <KeyButton variant="special" className="h-12 w-20 text-sm" onClick={backspace}>delete</KeyButton>
            </div>

            {/* Second row: caps lock + asdf + symbols + return */}
            <div className="flex gap-2">
              <KeyButton 
                variant={capsLock ? "primary" : "special"} 
                onClick={toggleCapsLock}
                className="h-12 w-24 text-sm"
              >
                caps lock
              </KeyButton>
              {['A','S','D','F','G','H','J','K','L'].map((ch, idx) => {
                const symbols = ['@','#','$','&','*','(',')','\'','"']
                const isLetter = /^[a-zA-Z]$/.test(ch)
                const displayChar = isLetter && !capsLock ? ch.toLowerCase() : ch
                return (
                  <div key={ch} className="relative flex-1">
                    <KeyButton className="h-12 w-full" onClick={() => push(displayChar)}>
                      {displayChar}
                    </KeyButton>
                    <div className="absolute top-0.5 left-1/2 transform -translate-x-1/2 text-xs text-gray-400 pointer-events-none">
                      {symbols[idx]}
                    </div>
                  </div>
                )
              })}
              <KeyButton variant="primary" className="h-12 w-20 text-sm" onClick={submit}>return</KeyButton>
            </div>

            {/* Third row: shift + zxcv + punctuation + shift */}
            <div className="flex gap-2">
              <KeyButton 
                variant="special" 
                onClick={toggleCapsLock}
                className="h-12 w-32 text-sm"
              >
                shift
              </KeyButton>
              {['Z','X','C','V','B','N','M'].map((ch, idx) => {
                const symbols = ['%','-','+','=','/','.',';']
                const isLetter = /^[a-zA-Z]$/.test(ch)
                const displayChar = isLetter && !capsLock ? ch.toLowerCase() : ch
                return (
                  <div key={ch} className="relative flex-1">
                    <KeyButton className="h-12 w-full" onClick={() => push(displayChar)}>
                      {displayChar}
                    </KeyButton>
                    <div className="absolute top-0.5 left-1/2 transform -translate-x-1/2 text-xs text-gray-400 pointer-events-none">
                      {symbols[idx]}
                    </div>
                  </div>
                )
              })}
              <KeyButton className="h-12 flex-1" onClick={() => push(',')}>
                <div className="relative">
                  ,
                  <div className="absolute top-0.5 left-1/2 transform -translate-x-1/2 text-xs text-gray-400 pointer-events-none">
                    !
                  </div>
                </div>
              </KeyButton>
              <KeyButton className="h-12 flex-1" onClick={() => push('.')}>
                <div className="relative">
                  .
                  <div className="absolute top-0.5 left-1/2 transform -translate-x-1/2 text-xs text-gray-400 pointer-events-none">
                    ?
                  </div>
                </div>
              </KeyButton>
              <KeyButton 
                variant="special" 
                onClick={toggleCapsLock}
                className="h-12 w-32 text-sm"
              >
                shift
              </KeyButton>
            </div>

            {/* Bottom row: .?123 + space + .?123 */}
            <div className="flex gap-2">
              <KeyButton variant="special" className="h-12 w-20 text-sm" onClick={() => {
                playKeySound()
                setCurrentMode('numeric')
              }}>.?123</KeyButton>
              <KeyButton className="h-12 flex-1" onClick={() => push(' ')}></KeyButton>
              <KeyButton variant="special" className="h-12 w-20 text-sm" onClick={() => {
                playKeySound()
                setCurrentMode('numeric')
              }}>.?123</KeyButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ModalKeyboard
