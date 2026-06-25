import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatWeight(grams: number): string {
  if (grams >= 1000) return `${(grams / 1000).toFixed(2)} kg`
  return `${grams.toFixed(1)} g`
}
