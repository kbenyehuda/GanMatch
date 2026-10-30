import type { Metadata } from "next";
import { LegalPage, Section, List, P, SITE_OWNER } from "@/components/legal/LegalPage";
import { CONTACT_EMAIL } from "@/lib/contact";

export const metadata: Metadata = {
  title: "הצהרת נגישות | GiveMyTime",
  description: "מה עשינו כדי שהאתר יהיה נגיש, מה עדיין לא מושלם, ואיך פונים אלינו.",
};

// From docs/legal/accessibility-statement.he.md (2026-10-30). Every line under "מה עשינו" must be true.
// Left out on purpose: color contrast (the light-gray small text doesn't meet AA yet).
export default function AccessibilityPage() {
  const mail = <a href={`mailto:${CONTACT_EMAIL}`} style={{ color: "#1F5BB5", fontWeight: 700 }}>{CONTACT_EMAIL}</a>;
  return (
    <LegalPage title="הצהרת נגישות" updated="30 באוקטובר 2026">
      <P>GiveMyTime הוא אתר קהילתי חינמי שמופעל על ידי אדם פרטי, ללא מחזור הכנסות. חשוב לנו שכל השכנים יוכלו להשתמש בו, כולל אנשים עם מוגבלות.</P>

      <Section title="מה עשינו">
        <List>
          <li>האתר בנוי בעברית ובכיוון מימין לשמאל, ומותאם לטלפון ולמחשב.</li>
          <li>אפשר להגדיל את הטקסט בעזרת הגדרות הדפדפן, בלי לאבד תוכן.</li>
          <li>השתדלנו לתת תיאור טקסטואלי לכפתורים שיש בהם רק אייקון.</li>
          <li>את רוב המידע במפה אפשר לראות גם כרשימה.</li>
        </List>
      </Section>

      <Section title="מה עדיין לא מושלם">
        <P>האתר עדיין לא נבדק מול התקן הישראלי 5568 (רמה AA). ייתכן שחלקים ממנו, ובמיוחד המפה האינטראקטיבית, לא נוחים לשימוש עם קורא מסך או עם מקלדת בלבד, ושחלק מהטקסט האפור הקטן לא מספיק בולט. אנחנו ממשיכים לשפר.</P>
      </Section>

      <Section title="נתקלתם בבעיה?">
        <P>כתבו לנו ב-{mail}. ספרו מה ניסיתם לעשות ובאיזה עמוד, ונשתדל לתקן או לתת לכם את המידע בדרך אחרת. נענה תוך כמה ימים.</P>
        <P>איש קשר לנושא נגישות: {SITE_OWNER}, {mail}.</P>
      </Section>
    </LegalPage>
  );
}
