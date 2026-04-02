import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const healthRouter = createTRPCRouter({
  check: publicProcedure.query(async () => {
    const results = {
      timestamp: new Date().toISOString(),
      environment: {
        hasOpenSkyCredentials: !!(process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET),
      },
      services: {} as Record<string, { status: string; responseTime?: number; error?: string }>,
    };

    // Test OpenSky OAuth Token (if credentials available)
    if (process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) {
      try {
        const start = Date.now();
        const tokenResponse = await fetch("https://opensky-network.org/api/oauth/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            grant_type: "client_credentials",
            client_id: process.env.OPENSKY_CLIENT_ID,
            client_secret: process.env.OPENSKY_CLIENT_SECRET,
          }),
          signal: AbortSignal.timeout(5000),
        });
        const tokenTime = Date.now() - start;

        if (tokenResponse.ok) {
          results.services.openskyOAuth = { status: "ok", responseTime: tokenTime };
        } else {
          results.services.openskyOAuth = {
            status: "error",
            responseTime: tokenTime,
            error: `HTTP ${tokenResponse.status}`
          };
        }
      } catch (error) {
        results.services.openskyOAuth = {
          status: "error",
          error: error instanceof Error ? error.message : String(error)
        };
      }
    }

    // Test OpenSky API (anonymous)
    try {
      const start = Date.now();
      const response = await fetch(
        "https://opensky-network.org/api/states/all?lamin=37&lomin=-123&lamax=38&lomax=-122",
        { signal: AbortSignal.timeout(10000) } // Increased to 10s
      );
      const responseTime = Date.now() - start;

      if (response.ok) {
        results.services.openskyAnonymous = { status: "ok", responseTime };
      } else {
        results.services.openskyAnonymous = {
          status: "error",
          responseTime,
          error: `HTTP ${response.status}`
        };
      }
    } catch (error) {
      results.services.openskyAnonymous = {
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      };
    }

    // Test Aviation Weather API
    try {
      const start = Date.now();
      const response = await fetch(
        "https://aviationweather.gov/api/data/metar?ids=KSFO&format=json",
        {
          headers: { "User-Agent": "FlightTracker" },
          signal: AbortSignal.timeout(5000)
        }
      );
      const responseTime = Date.now() - start;

      if (response.ok) {
        results.services.aviationWeather = { status: "ok", responseTime };
      } else {
        results.services.aviationWeather = {
          status: "error",
          responseTime,
          error: `HTTP ${response.status}`
        };
      }
    } catch (error) {
      results.services.aviationWeather = {
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      };
    }

    // Test ADSB.lol API
    try {
      const start = Date.now();
      const response = await fetch(
        "https://api.adsb.lol/v2/mil",
        { signal: AbortSignal.timeout(5000) }
      );
      const responseTime = Date.now() - start;

      if (response.ok) {
        results.services.adsbLol = { status: "ok", responseTime };
      } else {
        results.services.adsbLol = {
          status: "error",
          responseTime,
          error: `HTTP ${response.status}`
        };
      }
    } catch (error) {
      results.services.adsbLol = {
        status: "error",
        error: error instanceof Error ? error.message : String(error)
      };
    }

    return results;
  }),
});
