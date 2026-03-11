# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a T3 Stack project using Next.js 15, tRPC, React Query, TypeScript, and Tailwind CSS. The stack is designed for full-stack type-safe development with end-to-end type safety between frontend and backend.

## Development Commands

- `npm run dev` - Start development server with Turbo mode
- `npm run build` - Build production bundle
- `npm run preview` - Build and start production server locally
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Run ESLint with auto-fix
- `npm run typecheck` - Run TypeScript compiler check without emitting files
- `npm run check` - Run both linting and type checking
- `npm run format:check` - Check code formatting with Prettier
- `npm run format:write` - Format code with Prettier

## Architecture

### tRPC Setup

The project uses tRPC for type-safe API routes with the following structure:

- **Server-side**:
  - `src/server/api/trpc.ts` - Core tRPC setup, context creation, and procedure definitions. Includes a timing middleware that adds artificial delays in development (100-500ms) to catch unwanted waterfalls.
  - `src/server/api/root.ts` - Root router where all API routers are registered. This exports the `AppRouter` type used throughout the app.
  - `src/server/api/routers/` - Individual router modules (e.g., `post.ts`)

- **Client-side**:
  - `src/trpc/react.tsx` - React client setup with `api` export for client components. Wraps app with `TRPCReactProvider`.
  - `src/trpc/server.ts` - Server-side tRPC caller for use in Server Components and Server Actions
  - `src/app/api/trpc/[trpc]/route.ts` - Next.js API route handler for tRPC

**Key patterns**:
- Use `publicProcedure` from `~/server/api/trpc` when creating new procedures
- Import `createTRPCRouter` to define new routers
- Register new routers in `src/server/api/root.ts`
- Client components use `api` from `~/trpc/react` (e.g., `api.post.getLatest.useQuery()`)
- Server components use `api` from `~/trpc/server` for direct server-side calls

### Environment Variables

Environment variables are validated using `@t3-oss/env-nextjs` with Zod schemas in `src/env.js`.

**To add new environment variables**:
1. Update the schema in `src/env.js` (`server` for server-only, `client` for `NEXT_PUBLIC_*` vars)
2. Add to `runtimeEnv` object in same file
3. Update `.env.example`

### Next.js App Router

- Uses App Router (not Pages Router)
- `src/app/layout.tsx` - Root layout with `TRPCReactProvider`
- `src/app/page.tsx` - Homepage
- `src/app/_components/` - Shared components for app routes

### Styling

- Tailwind CSS v4 with PostCSS
- Global styles in `src/styles/globals.css`
- Prettier with `prettier-plugin-tailwindcss` for automatic class sorting

### Leaflet Maps & Flight Tracking

The project includes Leaflet for interactive maps using `react-leaflet` and integrates with the OpenSky Network API for real-time flight tracking.

**Components**:
- `DynamicMap` - Basic map component from `~/app/_components/dynamic-map`
- `DynamicFlightMap` - Flight tracking map from `~/app/_components/dynamic-flight-map`
- Both components are dynamically imported with SSR disabled to avoid window/document issues

**OpenSky API Integration**:
- tRPC endpoint: `api.flights.getFlights` in `src/server/api/routers/flights.ts`
- Fetches real-time civilian flight data with bounding box filtering
- **OAuth2 authentication** (optional, for higher rate limits):
  - Via environment variables: `OPENSKY_CLIENT_ID` and `OPENSKY_CLIENT_SECRET`
  - Or via `credentials.json` file in project root (clientId/clientSecret)
  - Falls back to anonymous access if neither is provided
  - Authenticated access provides higher rate limits (4000+ credits/day, 5-second resolution)
- Data refreshes every 60 seconds
- **Dynamic bounds**: Flight data is automatically fetched for the currently visible map region
  - Updates 10 seconds after you stop panning or zooming the map (debounced)
  - Uses Leaflet's `getBounds()` to get the viewport coordinates
  - Prevents excessive API calls while actively navigating the map

**ADSB.lol Military Flight Integration**:
- tRPC endpoint: `api.flights.getMilitaryFlights` in `src/server/api/routers/flights.ts`
- Fetches global military aircraft data from https://api.adsb.lol/v2/mil
- Military flights displayed in olive/military green color (#4a5d23)
- Includes aircraft type and registration information
- Data refreshes every 60 seconds
- No authentication required

**Airline Configuration**:
- Airline names and colors are stored in `src/data/airlines.json`
- Edit this JSON file to add new airlines or update existing ones
- Structure:
  - `airlines`: Each airline ICAO code has an entry with:
    - `name`: Full airline name (e.g., "United Airlines")
    - `color`: Brand color hex code (e.g., "#0033a0") or `null` to use auto-generated color
  - `specialColors`: Special aircraft type colors:
    - `military`: Olive/military green (#4a5d23) for military aircraft
    - `private`: Purple (#9333ea) for private/general aviation aircraft
    - `unknown`: Gray (#6b7280) for unidentified aircraft

**Example airline entry**:
```json
"UAL": { "name": "United Airlines", "color": "#0033a0" }
```

**Airport Data**:
- Major airports are stored in `src/data/airports.json`
- Contains airport codes, names, cities, countries, and coordinates
- Used for "Find Nearest Airport" feature based on browser geolocation
- Edit this file to add more airports

**Map Features**:
- **Search box** (top-right): Type airport code, city name, or airport name to search
  - Shows live search results as you type (minimum 2 characters)
  - Click on a result to center the map on that airport
  - Searches through airport code, city, and full airport name
- **"Nearest Airport" button**: Finds the closest airport to your location
  - Uses browser's Geolocation API to get current position
  - Calculates distance using Haversine formula
  - Automatically centers map on nearest airport
- **Weather display**: Shows current weather conditions for the nearest airport
  - Uses National Weather Service API (weather.gov)
  - Automatically finds the nearest airport to the map center
  - Displays airport code (e.g., "SFO") along with weather data
  - Updates every 5 minutes
  - Only works for US airports
  - Shows temperature, conditions, wind speed, and direction
  - Automatically updates when map is moved to a new location

**Weather.gov API Integration**:
- tRPC endpoint: `api.flights.getWeather` in `src/server/api/routers/flights.ts`
- Uses coordinates of the nearest airport to the map center
- Two-step process:
  1. Calls `/points/{lat},{lon}` to get grid coordinates for the airport
  2. Fetches forecast from returned grid endpoint
- Returns null for non-US locations (handled gracefully in UI)
- Includes User-Agent header as required by weather.gov

**Example**:
```tsx
import { DynamicFlightMap } from "~/app/_components/dynamic-flight-map";

<DynamicFlightMap center={[37.7749, -122.4194]} zoom={9} className="h-[600px] w-full" />
```
