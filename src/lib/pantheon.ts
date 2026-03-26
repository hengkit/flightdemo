import { PantheonClient } from "@pantheon-systems/cpub-react-sdk";
import { env } from "~/env";

console.log("Pantheon Client Config:", {
  siteId: env.NEXT_PUBLIC_PCC_SITE_ID,
  tokenPresent: !!env.NEXT_PUBLIC_PCC_TOKEN,
  tokenPrefix: env.NEXT_PUBLIC_PCC_TOKEN?.substring(0, 8),
});

export const pantheonClient = new PantheonClient({
  siteId: env.NEXT_PUBLIC_PCC_SITE_ID,
  token: env.NEXT_PUBLIC_PCC_TOKEN,
  debug: true,
});
