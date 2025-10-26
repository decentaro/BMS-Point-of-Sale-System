import React, { useEffect, useRef } from 'react'
import JsBarcode from 'jsbarcode'

interface BarcodeProps {
  value: string
  width?: number
  height?: number
  fontSize?: number
  displayValue?: boolean
  className?: string
}

const Barcode: React.FC<BarcodeProps> = ({
  value,
  width = 1,
  height = 30,
  fontSize = 8,
  displayValue = true,
  className = ''
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    if (canvasRef.current && value) {
      try {
        JsBarcode(canvasRef.current, value, {
          format: 'CODE128',
          width: width,
          height: height,
          displayValue: displayValue,
          fontSize: fontSize,
          margin: 2,
          background: '#ffffff',
          lineColor: '#000000'
        })
      } catch (error) {
        console.error('Error generating barcode:', error)
      }
    }
  }, [value, width, height, fontSize, displayValue])

  if (!value) {
    return null
  }

  return (
    <div className={`flex justify-center ${className}`}>
      <canvas ref={canvasRef} />
    </div>
  )
}

export default Barcode