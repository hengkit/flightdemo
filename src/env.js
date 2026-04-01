import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
  /**
   * Specify your server-side environment variables schema here. This way you can ensure the app
   * isn't built with invalid env vars.
   */
  server: {
    NODE_ENV: z.enum(["development", "test", "production"]),
    ARTICLES_CACHE_DURATION: z.coerce.number().default(60000),
  },
  client: {
    NEXT_PUBLIC_PCC_TOKEN: z.string(),
    NEXT_PUBLIC_PCC_SITE_ID: z.string(),
    NEXT_PUBLIC_PCC_COLLECTION_ID: z.string().optional(),
    NEXT_PUBLIC_ARTICLES_STALE_TIME: z.coerce.number().default(60000),
    NEXT_PUBLIC_AIRCRAFT_DETAILS_STALE_TIME: z.coerce.number().default(300000),
    NEXT_PUBLIC_FLIGHTS_REFETCH_INTERVAL: z.coerce.number().default(60000),
    NEXT_PUBLIC_WEATHER_REFETCH_INTERVAL: z.coerce.number().default(300000),
    NEXT_PUBLIC_SHIPS_REFETCH_INTERVAL: z.coerce.number().default(60000),
    NEXT_PUBLIC_SATELLITES_REFETCH_INTERVAL: z.coerce.number().default(60000),
    NEXT_PUBLIC_MAP_BOUNDS_DEBOUNCE: z.coerce.number().default(30000),
  },


  /**
   * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
   * middlewares) or client-side so we need to destruct manually.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    ARTICLES_CACHE_DURATION: process.env.ARTICLES_CACHE_DURATION,
    NEXT_PUBLIC_PCC_TOKEN: process.env.NEXT_PUBLIC_PCC_TOKEN,
    NEXT_PUBLIC_PCC_SITE_ID: process.env.NEXT_PUBLIC_PCC_SITE_ID,
    NEXT_PUBLIC_PCC_COLLECTION_ID: process.env.NEXT_PUBLIC_PCC_COLLECTION_ID,
    NEXT_PUBLIC_ARTICLES_STALE_TIME: process.env.NEXT_PUBLIC_ARTICLES_STALE_TIME,
    NEXT_PUBLIC_AIRCRAFT_DETAILS_STALE_TIME: process.env.NEXT_PUBLIC_AIRCRAFT_DETAILS_STALE_TIME,
    NEXT_PUBLIC_FLIGHTS_REFETCH_INTERVAL: process.env.NEXT_PUBLIC_FLIGHTS_REFETCH_INTERVAL,
    NEXT_PUBLIC_WEATHER_REFETCH_INTERVAL: process.env.NEXT_PUBLIC_WEATHER_REFETCH_INTERVAL,
    NEXT_PUBLIC_SHIPS_REFETCH_INTERVAL: process.env.NEXT_PUBLIC_SHIPS_REFETCH_INTERVAL,
    NEXT_PUBLIC_SATELLITES_REFETCH_INTERVAL: process.env.NEXT_PUBLIC_SATELLITES_REFETCH_INTERVAL,
    NEXT_PUBLIC_MAP_BOUNDS_DEBOUNCE: process.env.NEXT_PUBLIC_MAP_BOUNDS_DEBOUNCE,
  },
  /**
   * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
   * useful for Docker builds.
   */
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  /**
   * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
   * `SOME_VAR=''` will throw an error.
   */
  emptyStringAsUndefined: true,
});
