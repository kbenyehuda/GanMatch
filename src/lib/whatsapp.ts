/**
 * A WhatsApp chat link for a place, from its phone numbers. Only Israeli MOBILE numbers (05x) get one:
 * landlines (02/03/04/08/09 and 07x) can't receive WhatsApp. Accepts "050-1234567", "0501234567", "+972501234567",
 * "972 50 123 4567", "00972501234567". Returns null when there is no mobile number.
 */
export function whatsappLink(phones: string[] | null | undefined, text?: string): string | null {
  for (const raw of phones ?? []) {
    let digits = String(raw ?? "").replace(/\D/g, "");
    if (digits.startsWith("00")) digits = digits.slice(2);
    if (digits.startsWith("972")) digits = digits.slice(3);
    else if (digits.startsWith("0")) digits = digits.slice(1);
    // Israeli mobile numbers: 5X + 7 digits, 9 digits in total once the leading 0 / country code is gone
    if (/^5\d{8}$/.test(digits)) {
      return `https://wa.me/972${digits}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
    }
  }
  return null;
}
