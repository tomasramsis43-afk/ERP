/** Local numbers are taken as Egyptian (+20); a number that already has a country code is left as typed. */
export function whatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `20${digits.slice(1)}`;
  return digits;
}
