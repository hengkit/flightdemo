import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

export const healthRouter = createTRPCRouter({
  check: publicProcedure.query(async () => {
    const results = {
      timestamp: new Date().toISOString(),
      services: {} as Record<string, { status: string; responseTime?: number; error?: string }>,
    };

    // Test OpenSky API
    try {
      const start = Date.now();
      const response = await fetch(
        "https://opensky-network.org/api/states/all?lamin=37&lomin=-123&lamax=38&lomax=-122",
        { signal: AbortSignal.timeout(5000) }
      );
      const responseTime = Date.now() - start;

      if (response.ok) {
        results.services.opensky = { status: "ok", responseTime };
      } else {
        results.services.opensky = {
          status: "error",
          responseTime,
          error: `HTTP ${response.status}`
        };
      }
    } catch (error) {
      results.services.opensky = {
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
