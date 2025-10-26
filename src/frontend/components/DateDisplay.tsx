import React from 'react'
import { useFormattedDate } from '../hooks/useDateFormat'

interface DateDisplayProps {
  date: Date | string | null
  includeTime?: boolean
  className?: string
  fallback?: string
}

/**
 * Component that displays dates formatted according to user's system settings
 * 
 * Usage:
 * <DateDisplay date={sale.saleDate} />
 * <DateDisplay date={product.createdDate} includeTime />
 * <DateDisplay date={null} fallback="No date" />
 */
export function DateDisplay({ date, includeTime = false, className = '', fallback = '—' }: DateDisplayProps) {
  const { formattedDate, formattedDateTime, isLoading } = useFormattedDate(date)
  
  if (!date) {
    return <span className={className}>{fallback}</span>
  }
  
  if (isLoading) {
    return <span className={className}>Loading...</span>
  }
  
  const displayText = includeTime ? formattedDateTime : formattedDate
  
  return (
    <span className={className} title={includeTime ? formattedDateTime : undefined}>
      {displayText}
    </span>
  )
}

export default DateDisplay