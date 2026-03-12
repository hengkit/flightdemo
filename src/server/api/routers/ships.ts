import { z } from "zod";
import { createTRPCRouter, publicProcedure } from "~/server/api/trpc";
import WebSocket from "ws";

interface ShipPosition {
  mmsi: number;
  shipName: string | null;
  latitude: number;
  longitude: number;
  cog: number | null; // Course over ground
  sog: number | null; // Speed over ground
  heading: number | null;
  shipType: number | null;
  destination: string | null;
  eta: string | null;
  lastUpdate: number;
}

// In-memory cache of ship positions
const shipCache = new Map<number, ShipPosition>();

// WebSocket connection management
let ws: WebSocket | null = null;
let reconnectTimeout: NodeJS.Timeout | null = null;
const RECONNECT_DELAY = 5000; // 5 seconds
let lastSubscriptionUpdate = 0;
const MIN_SUBSCRIPTION_INTERVAL = 60000; // Minimum 1 minute between updates

// Get API key from environment
function getAISStreamAPIKey(): string | null {
  return process.env.AISSTREAM_API_KEY || null;
}

// Connect to AISStream WebSocket
function connectToAISStream(bounds: { lamin: number; lomin: number; lamax: number; lomax: number }) {
  const apiKey = getAISStreamAPIKey();

  if (!apiKey) {
    console.warn("No AISStream API key found, ship tracking disabled");
    return;
  }

  // Close existing connection if any
  if (ws) {
    ws.close();
    ws = null;
  }

  console.log("Connecting to AISStream...");
  ws = new WebSocket("wss://stream.aisstream.io/v0/stream");

  ws.on("open", () => {
    console.log("Connected to AISStream");

    // Send subscription message with bounding box
    const subscriptionMessage = {
      APIKey: apiKey,
      BoundingBoxes: [
        [
          [bounds.lamin, bounds.lomin],
          [bounds.lamax, bounds.lomax],
        ],
      ],
    };

    ws?.send(JSON.stringify(subscriptionMessage));
    console.log("Sent AISStream subscription for bounds:", bounds);
  });

  ws.on("ping", () => {
    ws?.pong();
  });

  ws.on("message", (data: WebSocket.Data) => {
    try {
      const parsed = JSON.parse(data.toString()) as {
        error?: string;
        MessageType?: string;
        MetaData?: {
          MMSI: number;
          ShipName?: string;
          latitude: number;
          longitude: number;
          time_utc: string;
        };
        Message?: {
          PositionReport?: {
            Cog?: number;
            Sog?: number;
            TrueHeading?: number;
          };
          ShipStaticData?: {
            Type?: number;
            Destination?: string;
            Eta?: string;
          };
        };
      };

      // Handle error messages from AISStream
      if (parsed.error) {
        console.error("AISStream error:", parsed.error);
        return;
      }

      // Skip messages without metadata
      if (!parsed.MetaData) {
        return;
      }

      const message = parsed as {
        MessageType: string;
        MetaData: {
          MMSI: number;
          ShipName?: string;
          latitude: number;
          longitude: number;
          time_utc: string;
        };
        Message?: {
          PositionReport?: {
            Cog?: number;
            Sog?: number;
            TrueHeading?: number;
          };
          ShipStaticData?: {
            Type?: number;
            Destination?: string;
            Eta?: string;
          };
        };
      };

      const mmsi = message.MetaData.MMSI;
      const existing = shipCache.get(mmsi);

      // Only log occasionally to avoid console spam
      if (Math.random() < 0.01) {
        console.log(`Ship data being cached: ${shipCache.size} ships tracked`);
      }

      // Update ship position in cache
      const shipPosition: ShipPosition = {
        mmsi,
        shipName: message.MetaData.ShipName || existing?.shipName || null,
        latitude: message.MetaData.latitude,
        longitude: message.MetaData.longitude,
        cog: message.Message?.PositionReport?.Cog ?? existing?.cog ?? null,
        sog: message.Message?.PositionReport?.Sog ?? existing?.sog ?? null,
        heading: message.Message?.PositionReport?.TrueHeading ?? existing?.heading ?? null,
        shipType: message.Message?.ShipStaticData?.Type ?? existing?.shipType ?? null,
        destination: message.Message?.ShipStaticData?.Destination ?? existing?.destination ?? null,
        eta: message.Message?.ShipStaticData?.Eta ?? existing?.eta ?? null,
        lastUpdate: Date.now(),
      };

      shipCache.set(mmsi, shipPosition);

      // Remove ships that haven't updated in 10 minutes
      const now = Date.now();
      for (const [mmsi, ship] of shipCache.entries()) {
        if (now - ship.lastUpdate > 600000) {
          shipCache.delete(mmsi);
        }
      }
    } catch (error) {
      console.error("Error processing AISStream message:", error);
    }
  });

  ws.on("error", (error) => {
    console.error("AISStream WebSocket error:", error);
  });

  ws.on("close", (code, reason) => {
    console.log(`AISStream WebSocket closed (code: ${code}, reason: ${reason.toString()}), will reconnect...`);
    ws = null;

    // Schedule reconnection
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout);
    }
    reconnectTimeout = setTimeout(() => {
      connectToAISStream(bounds);
    }, RECONNECT_DELAY);
  });
}

// Initial connection with default San Francisco Bay bounds
let currentBounds = {
  lamin: 37.0,
  lomin: -123.0,
  lamax: 38.5,
  lomax: -121.5,
};

// Start connection if API key is available
if (getAISStreamAPIKey()) {
  connectToAISStream(currentBounds);
}

// Update subscription on existing WebSocket
function updateSubscription(bounds: { lamin: number; lomin: number; lamax: number; lomax: number }) {
  const apiKey = getAISStreamAPIKey();
  if (!apiKey || !ws || ws.readyState !== WebSocket.OPEN) {
    return;
  }

  // Rate limit: don't send updates more than once per 2 seconds
  const now = Date.now();
  if (now - lastSubscriptionUpdate < MIN_SUBSCRIPTION_INTERVAL) {
    console.log("Skipping subscription update (rate limited)");
    return;
  }

  const subscriptionMessage = {
    APIKey: apiKey,
    BoundingBoxes: [
      [
        [bounds.lamin, bounds.lomin],
        [bounds.lamax, bounds.lomax],
      ],
    ],
  };

  ws.send(JSON.stringify(subscriptionMessage));
  lastSubscriptionUpdate = now;
  console.log("Updated AISStream subscription for bounds:", bounds);
}

export const shipsRouter = createTRPCRouter({
  getShips: publicProcedure
    .input(
      z.object({
        lamin: z.number(),
        lomin: z.number(),
        lamax: z.number(),
        lomax: z.number(),
      }),
    )
    .query(async ({ input }) => {
      // Update subscription if bounds changed significantly
      const boundsChanged =
        Math.abs(input.lamin - currentBounds.lamin) > 0.5 ||
        Math.abs(input.lomin - currentBounds.lomin) > 0.5 ||
        Math.abs(input.lamax - currentBounds.lamax) > 0.5 ||
        Math.abs(input.lomax - currentBounds.lomax) > 0.5;

      if (boundsChanged) {
        currentBounds = input;
        // Update subscription on existing connection instead of reconnecting
        updateSubscription(currentBounds);
      }

      // Return ships from cache
      return Array.from(shipCache.values());
    }),
});
