import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const healthRouter = createTRPCRouter({
  check: publicProcedure.query(async () => {
    const results = {
      timestamp: new Date().toISOString(),
      services: {} as Record<string, { status: string; responseTime?: number; error?: string; count?: number }>,
    };

    // Run all tests in parallel to avoid sequential timeouts
    const tests = [];

    // Test ADSB.lol /v2/all (civilian flights - primary data source)
    tests.push(
      (async () => {
        try {
          const start = Date.now();
          const response = await fetch(
            "https://api.adsb.lol/v2/all",
            { signal: AbortSignal.timeout(5000) }
          );
          const responseTime = Date.now() - start;

          if (response.ok) {
            const data = await response.json() as { ac?: unknown[] };
            results.services.adsbLolCivilian = {
              status: "ok",
              responseTime,
              count: data.ac?.length || 0
            };
          } else {
            results.services.adsbLolCivilian = {
              status: "error",
              responseTime,
              error: `HTTP ${response.status}`
            };
          }
        } catch (error) {
          results.services.adsbLolCivilian = {
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

    // Test ADSB.lol /v2/mil (military flights)
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
            const data = await response.json() as { ac?: unknown[] };
            results.services.adsbLolMilitary = {
              status: "ok",
              responseTime,
              count: data.ac?.length || 0
            };
          } else {
            results.services.adsbLolMilitary = {
              status: "error",
              responseTime,
              error: `HTTP ${response.status}`
            };
          }
        } catch (error) {
          results.services.adsbLolMilitary = {
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
