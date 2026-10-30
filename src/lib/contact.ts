/**
 * Where people write to fix or remove a recommendation, or to ask about their own business.
 * Today it's the same address as the about and privacy pages; a dedicated address
 * (e.g. privacy@givemytimeapp.com) can replace it here.
 */
export const CONTACT_EMAIL = "kbenyehuda2@gmail.com";

/** A mailto link to CONTACT_EMAIL with the subject and body already filled in. */
export function contactMailto(subject: string, body: string): string {
  return `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** The place's public link, for report emails. Fixed, so server and browser render the same href. */
function placeUrl(placeId: string): string {
  return `https://www.givemytimeapp.com/place/${placeId}`;
}

/** "דיווח" on one recommendation: wrong, offensive, or the writer wants it removed. */
export function reportReviewMailto(place: { id: string; name: string }, reviewId: string): string {
  return contactMailto(`דיווח על המלצה – ${place.name}`,
    `מקום: ${place.name}\n${placeUrl(place.id)}\nמזהה המלצה: ${reviewId}\n\nמה הבעיה? (למשל: לא נכון, פוגעני, כתבתי אותה ורוצה להסיר)\n`);
}

/** "דיווח על טעות / בקשת הסרה" for a whole place. */
export function reportPlaceMailto(place: { id: string; name: string }): string {
  return contactMailto(`דיווח על מקום – ${place.name}`,
    `מקום: ${place.name}\n${placeUrl(place.id)}\n\nמה הבעיה? (למשל: פרטים לא נכונים, המקום נסגר, בקשה להסיר)\n`);
}

/** "זה העסק שלכם?": an owner wants to fix details or ask about their listing. */
export function ownerMailto(place: { id: string; name: string }): string {
  return contactMailto(`זה העסק שלי – ${place.name}`,
    `מקום: ${place.name}\n${placeUrl(place.id)}\n\nשם ותפקיד:\nטלפון לחזרה:\nמה תרצו לעדכן?\n`);
}

/** The public name the WhatsApp import gives every recommendation (decision/route.ts). */
export const WHATSAPP_REVIEWER_NAME = "חבר/ה מהשכונה";
