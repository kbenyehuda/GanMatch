"use client";

import {
  Utensils,
  ChefHat,
  Truck,
  ShoppingBag,
  Leaf,
  Fish,
  Shield,
  ShieldCheck,
  ShieldAlert,
  Medal,
  TentTree,
  Music,
  Palette,
  Flower2,
  UserPlus,
  Users,
  UserX,
} from "lucide-react";
import type { Gan, MealType, KosherStatus, VacancyStatus, SpokenLanguage } from "@/types/ganim";
import { formatMealTypeHe, formatKosherStatusHe, formatSpokenLanguageHe, formatVacancyStatusHe } from "@/lib/gan-display";

/** Peanut icon for allergy-friendly (allergen symbol). */
function PeanutIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M14 6c1.5 0 3 1.5 3 3.5 0 1.5-1 2.5-2 3.5 1 1 2 2 2 3.5 0 2-1.5 3.5-3.5 3.5s-3.5-1.5-3.5-3.5c0-1.5 1-2.5 2-3.5-1-1-2-2-2-3.5 0-2 1.5-3.5 4-3.5Z" />
      <path d="M10 14.5c-.5-.5-1-1.5-1-2.5s.5-2 1-2.5" />
    </svg>
  );
}

/** Soccer ball icon for sport chugim. */
function SoccerBallIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 2a10 10 0 0 1 0 20" />
      <path d="M12 2a10 10 0 0 0 0 20" />
      <path d="M4.9 4.9a10 10 0 0 1 14.2 14.2" />
      <path d="M4.9 19.1a10 10 0 0 0 14.2-14.2" />
    </svg>
  );
}

/** Chicken drumstick icon for meat served. */
function DrumstickIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M18 11c0 2.21-1.79 4-4 4s-4-1.79-4-4 1.79-4 4-4 4 1.79 4 4Z" />
      <path d="m10 15-4 4" />
      <path d="M7 17c-1.5-1.5-3.5-1-4 0s1.5 3.5 3 4 3.5 0.5 4 0-1.5-2.5-3-4Z" />
    </svg>
  );
}

function getLanguageChar(lang: SpokenLanguage): { char: string; label: string; lang: string; fontClass: string } {
  switch (lang) {
    case "HEBREW": return { char: "א", label: "עברית", lang: "he", fontClass: "font-serif" };
    case "ENGLISH": return { char: "A", label: "אנגלית", lang: "en", fontClass: "font-sans" };
    case "RUSSIAN": return { char: "Я", label: "רוסית", lang: "ru", fontClass: "font-sans" };
    case "ARABIC": return { char: "ع", label: "ערבית", lang: "ar", fontClass: "font-serif" };
    default: return { char: "?", label: String(lang), lang: "en", fontClass: "font-sans" };
  }
}

interface IconItem {
  icon: React.ReactNode;
  title: string;
}

/** Chugim types that have icons. Hebrew terms (lowercase) map to icon key. */
const CHUGIM_ICON_MAP: Record<string, { icon: React.ReactNode; label: string }> = {
  מוזיקה: { icon: <Music className="w-4 h-4" />, label: "מוזיקה" },
  מנגינה: { icon: <Music className="w-4 h-4" />, label: "מוזיקה" },
  music: { icon: <Music className="w-4 h-4" />, label: "מוזיקה" },
  אמנות: { icon: <Palette className="w-4 h-4" />, label: "אמנות" },
  אומנות: { icon: <Palette className="w-4 h-4" />, label: "אמנות" },
  art: { icon: <Palette className="w-4 h-4" />, label: "אמנות" },
  ספורט: { icon: <SoccerBallIcon className="w-4 h-4" />, label: "ספורט" },
  sport: { icon: <SoccerBallIcon className="w-4 h-4" />, label: "ספורט" },
  יוגה: { icon: <Flower2 className="w-4 h-4" />, label: "יוגה" },
  yoga: { icon: <Flower2 className="w-4 h-4" />, label: "יוגה" },
};

function getChugimIconForType(chug: string): { icon: React.ReactNode; label: string } | null {
  const t = chug.trim();
  if (!t) return null;
  for (const [key, val] of Object.entries(CHUGIM_ICON_MAP)) {
    if (t.includes(key)) return val;
  }
  return null;
}

/** Renders attribute icons only when the gan has the value in the DB. */
export function GanAttributeIcons({ gan }: { gan: Gan }) {
  const items: IconItem[] = [];

  // Meal type – distinct icon per value
  if (gan.meal_type && gan.meal_type !== "UNKNOWN") {
    const text = formatMealTypeHe(gan.meal_type);
    if (text) {
      const MealIcon = getMealTypeIcon(gan.meal_type);
      items.push({ icon: <MealIcon className="w-4 h-4" />, title: `סוג אוכל: ${text}` });
    }
  }

  // Binary dietary
  if (gan.vegan_friendly === true) {
    items.push({ icon: <Leaf className="w-4 h-4" />, title: "טבעוני" });
  }
  if (gan.vegetarian_friendly === true) {
    items.push({ icon: <Fish className="w-4 h-4" />, title: "צמחוני" });
  }
  if (gan.meat_served === true) {
    items.push({ icon: <DrumstickIcon className="w-4 h-4" />, title: "מגיש בשר" });
  }
  if (gan.allergy_friendly === true) {
    items.push({
      icon: <PeanutIcon className="w-4 h-4" />,
      title: "ידידותי לאלרגיות",
    });
  }

  // Kosher status – distinct icon per value (hechsher-style)
  if (gan.kosher_status && gan.kosher_status !== "UNKNOWN") {
    const text = formatKosherStatusHe(gan.kosher_status);
    if (text) {
      const KosherIcon = getKosherStatusIcon(gan.kosher_status);
      const fullText = gan.kosher_certifier ? `${text} (${gan.kosher_certifier})` : text;
      items.push({ icon: <KosherIcon className="w-4 h-4" />, title: `כשרות: ${fullText}` });
    }
  }

  // Binary
  if (gan.first_aid_trained === true) {
    items.push({
      icon: <Medal className="w-4 h-4" />,
      title: "עזרה ראשונה",
    });
  }
  if (gan.has_outdoor_space === true) {
    items.push({
      icon: <TentTree className="w-4 h-4" />,
      title: "חצר חיצונית",
    });
  }
  if (gan.has_mamad === true) {
    items.push({
      icon: <Shield className="w-4 h-4" />,
      title: 'ממ"ד / מיקלט',
    });
  }

  // Languages – one icon per language (Hebrew, English, Russian, Arabic)
  if (gan.languages_spoken && gan.languages_spoken.length > 0) {
    for (const lang of gan.languages_spoken) {
      const { char, label, lang: langAttr, fontClass } = getLanguageChar(lang);
      items.push({
        icon: <span lang={langAttr} className={`text-xs font-bold leading-none ${fontClass}`} aria-hidden>{char}</span>,
        title: label,
      });
    }
  }

  // Chugim – only icons for known types (full list shown as text in detail)
  if (gan.chugim_types && gan.chugim_types.length > 0) {
    const seen = new Set<string>();
    for (const chug of gan.chugim_types) {
      const match = getChugimIconForType(chug);
      if (match && !seen.has(match.label)) {
        seen.add(match.label);
        items.push({ icon: match.icon, title: `חוג: ${match.label}` });
      }
    }
  }

  // Vacancy status – distinct icon per value
  if (gan.vacancy_status && gan.vacancy_status !== "UNKNOWN") {
    const text = formatVacancyStatusHe(gan.vacancy_status);
    if (text) {
      const VacancyIcon = getVacancyStatusIcon(gan.vacancy_status);
      items.push({ icon: <VacancyIcon className="w-4 h-4" />, title: `מקום פנוי: ${text}` });
    }
  }

  if (items.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2" role="list">
      {items.map((item, i) => (
        <span
          key={i}
          role="listitem"
          className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gan-muted/30 text-gan-dark border border-gan-accent/30"
          title={item.title}
          aria-label={item.title}
        >
          {item.icon}
        </span>
      ))}
    </div>
  );
}

function getMealTypeIcon(type: MealType) {
  switch (type) {
    case "IN_HOUSE_COOK":
      return ChefHat;
    case "EXTERNAL_CATERING":
      return Truck;
    case "PARENTS_BRING":
      return ShoppingBag;
    case "MIXED":
      return Utensils;
    default:
      return Utensils;
  }
}

function getKosherStatusIcon(status: KosherStatus) {
  switch (status) {
    case "CERTIFIED":
      return ShieldCheck;
    case "NOT_CERTIFIED":
      return ShieldAlert;
    default:
      return ShieldCheck;
  }
}

function getVacancyStatusIcon(status: VacancyStatus) {
  switch (status) {
    case "Available":
      return UserPlus;
    case "Limited":
      return Users;
    case "Full":
      return UserX;
    default:
      return UserPlus;
  }
}
