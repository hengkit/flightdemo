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

    // Run all tests in parallel to avoid sequential timeouts
    const tests = [];

    // Test OpenSky OAuth Token (if credentials available)
    if (process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) {
      tests.push(
        (async () => {
          try {
            const start = Date.now();
            const tokenResponse = await fetch("https://opensky-network.org/api/oauth/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                grant_type: "client_credentials",
                client_id: process.env.OPENSKY_CLIENT_ID!,
                client_secret: process.env.OPENSKY_CLIENT_SECRET!,
              }),
              signal: AbortSignal.timeout(3000), // Reduced to 3s
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
        })()
      );
    }

    // Test OpenSky API (anonymous)
    tests.push(
      (async () => {
        try {
          const start = Date.now();
          const response = await fetch(
            "https://opensky-network.org/api/states/all?lamin=37&lomin=-123&lamax=38&lomax=-122",
            { signal: AbortSignal.timeout(5000) } // Reduced to 5s
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
      })()
    );

    // Test Aviation Weather API
    tests.push(
      (async () => {
        try {
          const start = Date.now();
          const response = await fetch(
            "https://aviationweather.gov/api/data/metar?ids=KSFO&format=json",
            {
              headers: { "User-Agent": "FlightTracker" },
              signal: AbortSignal.timeout(3000)
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
      })()
    );

    // Test ADSB.lol API
    tests.push(
      (async () => {
        try {
          const start = Date.now();
          const response = await fetch(
            "https://api.adsb.lol/v2/mil",
            { signal: AbortSignal.timeout(3000) }
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
      })()
    );

    // Wait for all tests to complete (in parallel)
    await Promise.all(tests);

    return results;
  }),
});
