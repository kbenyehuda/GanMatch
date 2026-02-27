"use client";

import { Shield, Phone, X, Lock, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Gan } from "@/types/ganim";

interface GanDetailProps {
  gan: Gan;
  onClose: () => void;
  onBack?: () => void;
  canViewReviews: boolean; // Give-to-Get: true if user has contributed
  onRequestLogin?: () => void;
}

export function GanDetail({
  gan,
  onClose,
  onBack,
  canViewReviews,
  onRequestLogin,
}: GanDetailProps) {
  const phones = Array.isArray(gan.metadata?.phone)
    ? gan.metadata.phone
    : gan.metadata?.phone
      ? [String(gan.metadata.phone)]
      : [];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-start justify-between gap-4 p-4 pb-2">
        <div className="flex items-start gap-2 min-w-0">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              onClick={onBack}
              aria-label="חזרה לרשימה"
              title="חזרה לרשימה"
            >
              <ArrowRight className="w-5 h-5" />
            </Button>
          )}
          <CardTitle className="font-hebrew text-lg min-w-0 truncate">
            {gan.name_he}
          </CardTitle>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="סגור">
          <X className="w-5 h-5" />
        </Button>
      </CardHeader>
      <CardContent className="p-4 pt-0 space-y-4">
        {/* Government licensing data - always visible */}
        <div className="rounded-lg bg-gan-muted/50 p-4 space-y-2">
          <h4 className="font-medium text-gan-dark flex items-center gap-2">
            <Shield className="w-4 h-4" />
            נתוני רישוי ממשלתי
          </h4>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">
              סוג
            </dt>
            <dd className="text-gray-600">{gan.type}</dd>
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">
              סטטוס רישוי
            </dt>
            <dd className="text-gray-600">{gan.license_status}</dd>
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">
              מעקב CCTV
            </dt>
            <dd className="text-gray-600">{gan.has_cctv ? "כן ✓" : "לא"}</dd>
          </dl>
        </div>

        {/* Address & contact */}
        <div className="rounded-lg border border-gan-accent/30 bg-white p-4">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">
              כתובת
            </dt>
            <dd className="text-gray-600">{gan.address || "—"}</dd>
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">
              עיר
            </dt>
            <dd className="text-gray-600">{gan.city || "—"}</dd>
            <dt className="font-hebrew font-semibold text-gan-dark whitespace-nowrap">
              טלפון
            </dt>
            <dd className="text-gray-600">
              {phones.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {phones.map((p) => (
                    <a
                      key={p}
                      href={`tel:${p}`}
                      className="inline-flex items-center gap-1 text-gan-primary hover:underline"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      {p}
                    </a>
                  ))}
                </div>
              ) : (
                "—"
              )}
            </dd>
          </dl>
        </div>

        {/* Give-to-Get: Reviews section - blurred if no contribution */}
        <div>
          <h4 className="font-medium text-gan-dark mb-2">ביקורות הורים</h4>
          {canViewReviews ? (
            <p className="text-sm text-gray-600">
              כאן יוצגו ביקורות (קצוות, חסרונות, עצות להורים) לאחר שתבצע התחברות ותגש תרומה.
            </p>
          ) : (
            <div
              className="relative rounded-lg border border-gan-accent/50 p-4 bg-gan-muted/20"
              style={{ filter: "blur(4px)", userSelect: "none", pointerEvents: "none" }}
            >
              <p className="text-sm text-gray-500">
                תוכן הביקורות מוסתר. התחבר ופרסם ביקורת או &quot;הערת ביקור&quot; כדי לצפות.
              </p>
            </div>
          )}
          {!canViewReviews && (
            <div className="mt-2">
              <Button
                size="sm"
                onClick={onRequestLogin}
                className="gap-2"
              >
                <Lock className="w-4 h-4" />
                התחבר כדי לצפות
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
