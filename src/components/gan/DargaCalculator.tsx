"use client";

import { useState } from "react";
import { Calculator } from "lucide-react";
import { calculateDargaSubsidy } from "@/lib/darga-calculator";

export function DargaCalculator() {
  const [householdIncome, setHouseholdIncome] = useState<string>("");
  const [householdSize, setHouseholdSize] = useState<string>("2");
  const [result, setResult] = useState<{ darga: number; subsidy: number } | null>(null);

  const handleCalculate = () => {
    const income = parseFloat(householdIncome.replace(/,/g, ""));
    const size = parseInt(householdSize, 10);
    if (!isNaN(income) && !isNaN(size) && size > 0) {
      const r = calculateDargaSubsidy(income, size);
      setResult(r);
    } else {
      setResult(null);
    }
  };

  return (
    <div className="rounded-lg border border-gan-accent/50 p-4 space-y-3">
      <h4 className="font-medium text-gan-dark flex items-center gap-2">
        <Calculator className="w-4 h-4" />
        מחשבון דרגת תשלום (הנחה לפי הכנסה)
      </h4>
      <p className="text-xs text-gray-600">
        אומדן לפי טבלאות משרד העבודה 2025–2026. לא תחליף לאישור רשמי.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-600 mb-1">הכנסה חודשית נטו (₪)</label>
          <input
            type="text"
            inputMode="numeric"
            placeholder="15000"
            value={householdIncome}
            onChange={(e) => setHouseholdIncome(e.target.value)}
            className="w-full px-3 py-2 rounded border border-gan-accent/50 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-600 mb-1">מספר נפשות (עד גיל 18)</label>
          <input
            type="number"
            min="1"
            max="15"
            value={householdSize}
            onChange={(e) => setHouseholdSize(e.target.value)}
            className="w-full px-3 py-2 rounded border border-gan-accent/50 text-sm"
          />
        </div>
      </div>
      <button
        type="button"
        onClick={handleCalculate}
        className="w-full py-2 rounded-lg bg-gan-primary text-white text-sm font-medium hover:bg-gan-dark transition-colors"
      >
        חשב דרגה
      </button>
      {result && (
        <div className="rounded bg-gan-muted/50 p-3 text-sm">
          <p className="font-medium text-gan-dark">
            דרגה משוערת: {result.darga}
          </p>
          <p className="text-gray-600">
            הנחה משוערת לחודש: עד ₪{result.subsidy.toLocaleString("he-IL")}
          </p>
        </div>
      )}
    </div>
  );
}
