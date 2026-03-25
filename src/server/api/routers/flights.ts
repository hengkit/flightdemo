import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import fs from "fs";
import path from "path";

interface OpenSkyState {
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

interface OpenSkyResponse {
  time: number;
  states: Array<
    [
      string, // icao24
      string | null, // callsign
      string, // origin_country
      number | null, // time_position
      number, // last_contact
      number | null, // longitude
      number | null, // latitude
      number | null, // baro_altitude
      boolean, // on_ground
      number | null, // velocity
      number | null, // true_track
      number | null, // vertical_rate
      number[] | null, // sensors
      number | null, // geo_altitude
      string | null, // squawk
      boolean, // spi
      number, // position_source
      number | null, // category
    ]
  > | null;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

// Token manager for OAuth2 Client Credentials Flow
class OpenSkyTokenManager {
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private readonly TOKEN_ENDPOINT =
    "https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token";
  private readonly REFRESH_MARGIN_MS = 30000; // Refresh 30 seconds before expiry

  constructor(
    private clientId: string,
    private clientSecret: string,
  ) {}

  async getToken(): Promise<string> {
    // Check if we have a valid token
    if (this.accessToken && Date.now() < this.tokenExpiry - this.REFRESH_MARGIN_MS) {
      return this.accessToken;
    }

    // Request a new token
    console.log("Requesting new OpenSky access token...");
    const response = await fetch(this.TOKEN_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: this.clientId,
        client_secret: this.clientSecret,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to obtain access token: ${response.status} - ${errorText}`,
      );
    }

    const data = (await response.json()) as TokenResponse;
    this.accessToken = data.access_token;
    // expires_in is in seconds, convert to milliseconds
    this.tokenExpiry = Date.now() + data.expires_in * 1000;

    console.log(
      `Access token obtained, expires in ${data.expires_in} seconds`,
    );
    return this.accessToken;
  }
}

// Read credentials from environment variables or file
function getOpenSkyCredentials() {
  // First, try to read from environment variables
  if (process.env.OPENSKY_CLIENT_ID && process.env.OPENSKY_CLIENT_SECRET) {
    return {
      clientId: process.env.OPENSKY_CLIENT_ID,
      clientSecret: process.env.OPENSKY_CLIENT_SECRET,
    };
  }

  // Fall back to credentials.json file
  try {
    const credentialsPath = path.join(process.cwd(), "credentials.json");
    const credentialsFile = fs.readFileSync(credentialsPath, "utf-8");
    const credentials = JSON.parse(credentialsFile) as {
      clientId: string;
      clientSecret: string;
    };
    return credentials;
  } catch (error) {
    console.warn("Could not read credentials from environment variables or credentials.json, using anonymous access");
    return null;
  }
}

// Singleton token manager instance
let tokenManager: OpenSkyTokenManager | null = null;

function getTokenManager(): OpenSkyTokenManager | null {
  if (!tokenManager) {
    const credentials = getOpenSkyCredentials();
    if (credentials) {
      tokenManager = new OpenSkyTokenManager(
        credentials.clientId,
        credentials.clientSecret,
      );
    }
  }
  return tokenManager;
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

      const url = `https://opensky-network.org/api/states/all?lamin=${lamin}&lomin=${lomin}&lamax=${lamax}&lomax=${lomax}`;

      try {
        const headers: HeadersInit = {};
        const manager = getTokenManager();

        // Add Bearer token if credentials are available
        if (manager) {
          const token = await manager.getToken();
          headers["Authorization"] = `Bearer ${token}`;
          console.log("Using authenticated OpenSky API access (OAuth2)");
        } else {
          console.log("Using anonymous OpenSky API access");
        }

        const response = await fetch(url, { headers });

        if (!response.ok) {
          throw new Error(`OpenSky API error: ${response.status}`);
        }

        const data = (await response.json()) as OpenSkyResponse;

        if (!data.states) {
          return [];
        }

        // Transform the array format to objects
        const flights: OpenSkyState[] = data.states
          .filter((state) => state[5] !== null && state[6] !== null) // Filter out flights without position
          .map((state) => ({
            icao24: state[0],
            callsign: state[1]?.trim() || null,
            origin_country: state[2],
            time_position: state[3],
            last_contact: state[4],
            longitude: state[5],
            latitude: state[6],
            baro_altitude: state[7],
            on_ground: state[8],
            velocity: state[9],
            true_track: state[10],
            vertical_rate: state[11],
            sensors: state[12],
            geo_altitude: state[13],
            squawk: state[14],
            spi: state[15],
            position_source: state[16],
            category: state[17],
          }));

        return flights;
      } catch (error) {
        console.error("Error fetching from OpenSky API:", error);
        throw new Error("Failed to fetch flight data");
      }
    }),

  getMilitaryFlights: publicProcedure.query(async () => {
    try {
      const response = await fetch("https://api.adsb.lol/v2/mil");

      if (!response.ok) {
        throw new Error(`ADSB.lol API error: ${response.status}`);
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
        }>;
      };

      if (!data.ac) {
        return [];
      }

      // Transform ADSB.lol format to match OpenSky format
      const militaryFlights: OpenSkyState[] = data.ac
        .filter((ac) => ac.lat !== undefined && ac.lon !== undefined)
        .map((ac) => ({
          icao24: ac.hex,
          callsign: ac.flight?.trim() || null,
          origin_country: "Military", // ADSB.lol doesn't provide country
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
          is_military: true,
          aircraft_type: ac.t ?? null,
          registration: ac.r ?? null,
        }));

      return militaryFlights;
    } catch (error) {
      console.error("Error fetching from ADSB.lol API:", error);
      // Don't throw - just return empty array if military data fails
      return [];
    }
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
        });

        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          throw new Error(`Aviation Weather API error: ${response.status}`);
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
        const response = await fetch(url);

        if (!response.ok) {
          if (response.status === 404) {
            return null;
          }
          throw new Error(`Aircraft API error: ${response.status}`);
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
