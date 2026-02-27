"use client";

import { LogIn, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/lib/supabase";
import { useSession } from "@/lib/useSession";

export function AuthButton() {
  const { user, loading } = useSession();

  const signIn = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: typeof window !== "undefined" ? window.location.origin : undefined,
      },
    });
  };

  const signOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  if (loading) {
    return (
      <div className="text-xs text-gray-500 font-hebrew bg-white/95 backdrop-blur px-3 py-2 rounded-full shadow-lg">
        טוען...
      </div>
    );
  }

  if (!user) {
    return (
      <Button
        type="button"
        size="sm"
        onClick={signIn}
        className="bg-white/95 backdrop-blur text-gan-dark hover:bg-white border border-gan-accent/30 shadow-lg"
        variant="secondary"
      >
        <LogIn className="w-4 h-4" />
        התחברות (Google)
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2 bg-white/95 backdrop-blur px-3 py-2 rounded-full shadow-lg border border-gan-accent/30">
      <div className="flex items-center gap-2 min-w-0">
        <UserRound className="w-4 h-4 text-gan-primary" />
        <span className="text-xs text-gray-700 font-hebrew truncate max-w-[10rem]">
          {user.user_metadata?.full_name || user.email || "מחובר"}
        </span>
      </div>
      <Button type="button" size="sm" variant="ghost" onClick={signOut} className="h-7 px-2">
        <LogOut className="w-4 h-4" />
      </Button>
    </div>
  );
}

