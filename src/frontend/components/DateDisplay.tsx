import { formatDateSync, formatTime } from '../utils/dateFormat'

interface DateDisplayProps {
  date: Date | string | null
  includeTime?: boolean
  className?: string
  fallback?: string
}

/**
 * Component that displays dates formatted according to user's system settings.
 * Uses synchronous formatters so dates render immediately with no loading flash.
 */
export function DateDisplay({ date, includeTime = false, className = '', fallback = '—' }: DateDisplayProps) {
  if (!date) {
    return <span className={className}>{fallback}</span>
  }

  const datePart = formatDateSync(date)
  const displayText = includeTime ? `${datePart}, ${formatTime(date)}` : datePart

  return (
    <span className={className}>
      {displayText}
    </span>
  )
}

export default DateDisplay