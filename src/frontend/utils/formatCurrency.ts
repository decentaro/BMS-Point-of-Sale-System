// Simple currency formatting utility - no symbol, just amount with 2 decimal places
export const formatCurrency = (amount: number): string => {
  return amount.toFixed(2)
}

export default formatCurrency