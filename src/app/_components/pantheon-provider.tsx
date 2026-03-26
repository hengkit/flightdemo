"use client";

import { PantheonProvider } from "@pantheon-systems/cpub-react-sdk";
import { pantheonClient } from "~/lib/pantheon";

export function PantheonClientProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return <PantheonProvider client={pantheonClient}>{children}</PantheonProvider>;
}
