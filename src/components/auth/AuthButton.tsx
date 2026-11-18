"use client";

import { LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSession } from "@/lib/useSession";
import { signInWithGoogle } from "@/lib/sign-in";

/**
 * Wide layout, top of the map: the sign-in button for visitors who are not signed in.
 * Once signed in it shows nothing: the avatar and heart at the top of the side panel open the
 * profile (sign out, delete account, about) and the saved places.
 */
export function AuthButton() {
  const { user, loading } = useSession();

  const signIn = () => signInWithGoogle();

  if (loading) {
    return (
      <div className="text-xs text-gray-500 font-hebrew bg-white/95 backdrop-blur px-3 py-2 rounded-full shadow-lg">
        טוען...
      </div>
    );
  }

  if (user) return null;

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
