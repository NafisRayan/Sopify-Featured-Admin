export function generateCarrierTrackingUrl(carrier: string | undefined | null, trackingNumber: string | undefined | null): string | null {
  if (!trackingNumber?.trim()) return null
  const num = trackingNumber.trim()
  const c = (carrier || '').toLowerCase()

  if (c.includes('usps') || num.startsWith('9400') || num.startsWith('9205')) {
    return `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encodeURIComponent(num)}`
  }
  if (c.includes('fedex') || /^\d{12}$/.test(num) || /^\d{15}$/.test(num)) {
    return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(num)}`
  }
  if (c.includes('ups') || num.startsWith('1Z')) {
    return `https://www.ups.com/track?tracknum=${encodeURIComponent(num)}`
  }
  if (c.includes('dhl') || /^\d{10}$/.test(num)) {
    return `https://www.dhl.com/en/express/tracking.html?AWB=${encodeURIComponent(num)}`
  }

  return `https://track.northstargoods.com/${encodeURIComponent(num)}`
}
