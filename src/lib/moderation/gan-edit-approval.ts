import "server-only";
import { ValidationEngine } from "@/lib/moderation/validation-engine";

export type GanEditPatch = Record<string, unknown>;

type ExistingGanSnapshot = {
  monthly_price_nis?: number | null;
  address?: string | null;
  city?: string | null;
  min_age_months?: number | null;
  max_age_months?: number | null;
  phone?: string[] | null;
  website_url?: string | null;
  lat?: number | null;
  lon?: number | null;
};

export type GanEditModerationDecision = {
  status: "approved" | "pending";
  reasonCodes: string[];
  skipInsert?: boolean;
};

export async function approveGanEditPatch(args: {
  userId: string;
  ganId: string;
  patch: GanEditPatch;
  approvedEditsCount: number;
  recentEditCountLastMinute: number;
  userEmail?: string | null;
  emailConfirmed?: boolean;
  oauthProvider?: string | null;
  existingGan?: ExistingGanSnapshot | null;
}): Promise<GanEditModerationDecision> {
  const engine = new ValidationEngine();
  return engine.evaluate({
    patch: args.patch,
    existingGan: args.existingGan,
    approvedEditsCount: args.approvedEditsCount,
    recentEditCountLastMinute: args.recentEditCountLastMinute,
    user: {
      email: args.userEmail ?? null,
      emailConfirmed: Boolean(args.emailConfirmed),
      oauthProvider: args.oauthProvider ?? null,
    },
  });
}

