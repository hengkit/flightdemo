import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";

interface Satellite {
  satid: number;
  satname: string;
  intDesignator: string;
  launchDate: string;
  satlat: number;
  satlng: number;
  satalt: number;
}

interface N2YOResponse {
  info: {
    category: string;
    transactionscount: number;
    satcount: number;
  };
  above: Satellite[];
}

// Get API key from environment
function getN2YOAPI_KEY(): string | null {
  return process.env.N2YO_API_KEY || null;
}

export const satellitesRouter = createTRPCRouter({
  getSatellites: publicProcedure
    .input(
      z.object({
        latitude: z.number(),
        longitude: z.number(),
        altitude: z.number().default(0), // Sea level
        searchRadius: z.number().min(0).max(90).default(90), // 90 = all above horizon
        categoryId: z.number().default(0), // 0 = all categories
      }),
    )
    .query(async ({ input }) => {
      const apiKey = getN2YOAPI_KEY();

      if (!apiKey) {
        console.warn("No N2YO API key found, satellite tracking disabled");
        return [];
      }

      try {
        const url = `https://api.n2yo.com/rest/v1/satellite/above/${input.latitude}/${input.longitude}/${input.altitude}/${input.searchRadius}/${input.categoryId}&apiKey=${apiKey}`;

        const response = await fetch(url);

        if (!response.ok) {
          console.error(`N2YO API error: ${response.status} ${response.statusText}`);
          return [];
        }

        const data = (await response.json()) as N2YOResponse;

        console.log(`N2YO API: Found ${data.info.satcount} satellites above observer`);

        return data.above || [];
      } catch (error) {
        console.error("Error fetching satellites from N2YO:", error);
        return [];
      }
    }),
});
