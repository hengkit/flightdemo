import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

// Flight state interface (compatible with ADSB.lol data)
interface FlightState {
  icao24: string;
  callsign: string | null;
  origin_country: string;
  time_position: number | null;
  last_contact: number;
  longitude: number | null;
  latitude: number | null;
  baro_altitude: number | null;
  on_ground: boolean;
  velocity: number | null;
  true_track: number | null;
  vertical_rate: number | null;
  sensors: number[] | null;
  geo_altitude: number | null;
  squawk: string | null;
  spi: boolean;
  position_source: number;
  category: number | null;
  is_military?: boolean;
  aircraft_type?: string | null;
  registration?: string | null;
}

// Server-side cache for flight data
interface CachedFlightData {
  data: FlightState[];
  timestamp: number;
}

const flightCache = new Map<string, CachedFlightData>();
const CACHE_TTL = 60000; // 60 seconds cache

function getCacheKey(lamin: number, lomin: number, lamax: number, lomax: number): string {
  // Round to 2 decimals to group similar bounding boxes
  return `${lamin.toFixed(2)},${lomin.toFixed(2)},${lamax.toFixed(2)},${lomax.toFixed(2)}`;
}

export const flightsRouter = createTRPCRouter({
  getFlights: publicProcedure
    .input(
      z.object({
        lamin: z.number(),
        lomin: z.number(),
        lamax: z.number(),
        lomax: z.number(),
      }),
    )
    .query(async ({ input }) => {
      const { lamin, lomin, lamax, lomax } = input;

      // Check cache first
      const cacheKey = getCacheKey(lamin, lomin, lamax, lomax);
      const cached = flightCache.get(cacheKey);
      const now = Date.now();

      if (cached && (now - cached.timestamp) < CACHE_TTL) {
        console.log(`Returning cached flight data (age: ${Math.round((now - cached.timestamp) / 1000)}s)`);
        return cached.data;
      }

      // Use ADSB.lol /v2/all for all civilian flights (fast and reliable)
      const url = "https://api.adsb.lol/v2/all";

      try {
        const response = await fetch(url, {
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        if (!response.ok) {
          console.warn(`ADSB.lol API returned status ${response.status}`);
          // Try stale cache on API error
          const cached = flightCache.get(cacheKey);
          if (cached) {
            const age = Math.round((Date.now() - cached.timestamp) / 1000);
            console.log(`ADSB.lol failed, returning stale cached data (age: ${age}s, ${cached.data.length} flights)`);
            return cached.data;
          }
          return [];
        }

        const data = (await response.json()) as {
          ac: Array<{
            hex: string;
            flight?: string;
            r?: string; // registration
            t?: string; // aircraft type
            lat?: number;
            lon?: number;
            alt_baro?: number;
            alt_geom?: number;
            gs?: number;
            track?: number;
            squawk?: string;
            baro_rate?: number;
            dbFlags?: number; // database flags for military detection
          }>;
        };

        if (!data.ac) {
          return [];
        }

        // Transform ADSB.lol format to FlightState interface
        // Filter by bounding box and include both civilian and military aircraft
        const flights: FlightState[] = data.ac
          .filter((ac) => {
            // Must have position
            if (ac.lat === undefined || ac.lon === undefined) return false;

            // Filter by bounding box
            if (ac.lat < lamin || ac.lat > lamax) return false;
            if (ac.lon < lomin || ac.lon > lomax) return false;

            return true;
          })
          .map((ac) => {
            // Check if military: dbFlags bit 1 indicates military in ADSB.lol
            const isMilitary = !!(ac.dbFlags && (ac.dbFlags & 1));

            return {
              icao24: ac.hex,
              callsign: ac.flight?.trim() || null,
              origin_country: isMilitary ? "Military" : "Unknown",
              time_position: null,
              last_contact: Date.now() / 1000,
              longitude: ac.lon!,
              latitude: ac.lat!,
              baro_altitude: ac.alt_baro ?? null,
              on_ground: (ac.alt_baro ?? 0) < 100,
              velocity: ac.gs ?? null,
              true_track: ac.track ?? null,
              vertical_rate: ac.baro_rate ?? null,
              sensors: null,
              geo_altitude: ac.alt_geom ?? null,
              squawk: ac.squawk ?? null,
              spi: false,
              position_source: 0,
              category: null,
              is_military: isMilitary,
              aircraft_type: ac.t ?? null,
              registration: ac.r ?? null,
            };
          });

        // Cache the successful response
        flightCache.set(cacheKey, {
          data: flights,
          timestamp: Date.now(),
        });

        const civilianCount = flights.filter(f => !f.is_military).length;
        const militaryCount = flights.filter(f => f.is_military).length;
        console.log(`ADSB.lol: Cached ${flights.length} total flights (${civilianCount} civilian, ${militaryCount} military) for bounds ${cacheKey}`);

        return flights;
      } catch (error) {
        console.error("Error fetching from ADSB.lol API:", error);

        // Try to return stale cached data as fallback
        const cached = flightCache.get(cacheKey);
        if (cached) {
          const age = Math.round((Date.now() - cached.timestamp) / 1000);
          console.log(`ADSB.lol failed, returning stale cached data (age: ${age}s, ${cached.data.length} flights)`);
          return cached.data;
        }

        // Return empty array only if no cache available
        console.warn("ADSB.lol failed and no cached data available");
        return [];
      }
    }),

  // DEPRECATED: Military flights are now included in getFlights response
  // Kept for backwards compatibility, returns empty array
  getMilitaryFlights: publicProcedure.query(async () => {
    console.warn("getMilitaryFlights is deprecated - military flights are included in getFlights");
    return [];
  }),

  getWeather: publicProcedure
    .input(
      z.object({
        airportCode: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const { airportCode } = input;

      try {
        // Use aviationweather.gov METAR API
        const url = `https://aviationweather.gov/api/data/metar?ids=${airportCode}&format=json`;
        const response = await fetch(url, {
          headers: {
            "User-Agent": "FlightTracker (contact@example.com)",
          },
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        if (!response.ok) {
          console.warn(`Aviation Weather API returned status ${response.status}`);
          return null;
        }

        const data = (await response.json()) as Array<{
          icaoId: string;
          receiptTime: string;
          obsTime: number;
          reportTime: string;
          temp: number;
          dewp: number;
          wdir: number;
          wspd: number;
          wgst?: number;
          visib: string;
          altim: number;
          slp?: number;
          qcField: number;
          wxString?: string;
          presTend?: number;
          maxT?: number;
          minT?: number;
          maxT24?: number;
          minT24?: number;
          precip?: number;
          pcp3hr?: number;
          pcp6hr?: number;
          pcp24hr?: number;
          snow?: number;
          vertVis?: number;
          metarType: string;
          rawOb: string;
          mostRecent: number;
          lat: number;
          lon: number;
          elev: number;
          prior: number;
          name: string;
          clouds?: Array<{
            cover: string;
            base?: number;
          }>;
        }>;

        if (!data || data.length === 0) {
          return null;
        }

        const metar = data[0];
        if (!metar) {
          return null;
        }

        // Convert wind direction to compass direction
        const getWindDirection = (degrees: number): string => {
          const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
          const index = Math.round(degrees / 22.5) % 16;
          return directions[index] ?? "N";
        };

        // Get sky condition from clouds
        const getSkyCondition = (): string => {
          if (!metar.clouds || metar.clouds.length === 0) {
            return metar.wxString || "Clear";
          }
          const cloudCover = metar.clouds[0]?.cover;
          if (cloudCover === "SKC" || cloudCover === "CLR") return "Clear";
          if (cloudCover === "FEW") return "Few Clouds";
          if (cloudCover === "SCT") return "Scattered Clouds";
          if (cloudCover === "BKN") return "Broken Clouds";
          if (cloudCover === "OVC") return "Overcast";
          return metar.wxString || "Unknown";
        };

        return {
          location: metar.name || airportCode,
          temperature: Math.round(metar.temp),
          temperatureUnit: "C",
          windSpeed: `${Math.round(metar.wspd)} kts`,
          windDirection: getWindDirection(metar.wdir),
          visibility: metar.visib,
          shortForecast: getSkyCondition(),
          detailedForecast: metar.rawOb,
          periodName: "Current",
        };
      } catch (error) {
        console.error("Error fetching aviation weather data:", error);
        return null;
      }
    }),

  getAircraftDetails: publicProcedure
    .input(
      z.object({
        icao24: z.string(),
      }),
    )
    .query(async ({ input }) => {
      const { icao24 } = input;

      try {
        const url = `https://live-flightdemo-api.pantheonsite.io/wp-json/wp/v2/aircraft?slug=${icao24}&_fields=title,acf`;
        const response = await fetch(url, {
          signal: AbortSignal.timeout(10000), // 10 second timeout
        });

        if (!response.ok) {
          console.warn(`Aircraft API returned status ${response.status} for ${icao24}`);
          return null;
        }

        const data = await response.json() as Array<{
          title: { rendered: string };
          acf: Record<string, unknown>;
        }>;

        if (!data || data.length === 0) {
          return null;
        }

        const aircraft = data[0];
        if (!aircraft) {
          return null;
        }

        return {
          title: aircraft.title.rendered,
          acf: aircraft.acf,
        };
      } catch (error) {
        console.error("Error fetching aircraft details:", error);
        return null;
      }
    }),
});
