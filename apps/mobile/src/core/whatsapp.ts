/**
 * Turns a phone number as typed in the customer file ("0100 123 4567", "+20 100...", "0020100...") into the
 * international digits WhatsApp expects. A leading single 0 is treated as an Egyptian local number.
 */
export function whatsappNumber(phone: string | null | undefined, countryCode = '20'): string | null {
  if (!phone) return null;
  let d = phone.replace(/[^\d]/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  else if (d.startsWith('0')) d = countryCode + d.slice(1);
  return d.length >= 8 && d.length <= 15 ? d : null;
}

/** wa.me link that opens the chat with the text prefilled; without a number it opens the contact picker. */
export function whatsappUrl(phone: string | null | undefined, text: string): string {
  const n = whatsappNumber(phone);
  return `https://wa.me/${n ?? ''}?text=${encodeURIComponent(text)}`;
}

/** tel: link for the dialer, digits and a leading + only. */
export function telUrl(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const v = phone.trim().replace(/[^\d+]/g, '');
  return v.length >= 3 ? `tel:${v}` : null;
}
