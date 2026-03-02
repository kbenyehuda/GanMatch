export type GanEditPatch = Record<string, unknown>;

export async function approveGanEditPatch(_args: {
  userId: string;
  ganId: string;
  patch: GanEditPatch;
}): Promise<{ approved: true } | { approved: false; reason: string }> {
  // Dummy policy for now (auto-approve). We'll replace this with real moderation logic later.
  return { approved: true };
}

