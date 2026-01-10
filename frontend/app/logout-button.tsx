"use client";

import { signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  return (
    <Button
      variant="outline"
      onClick={() => signOut({ callbackUrl: "/login" })}
      className="px-4 gap-2 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-colors"
    >
      <LogOut className="w-4 h-4" />
      Logout
    </Button>
  );
}