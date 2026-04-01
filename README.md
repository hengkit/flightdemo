# Flight Tracking Demo

A real-time tracking application built with the [T3 Stack](https://create.t3.gg/) that displays live aircraft, ships, and satellites on an interactive map.

## Features

- **Live Aircraft Tracking**: Real-time civilian and military aircraft positions using OpenSky Network and ADSB.lol APIs
- **Ship Tracking**: AIS vessel data via WebSocket connection to AISStream
- **Satellite Tracking**: Overhead satellite positions using N2YO API
- **Airline Information**: Rich airline and aircraft model details from Pantheon Content Publisher CMS
- **Weather Data**: Current METAR weather conditions for nearby airports
- **Interactive Map**: Search airports, find nearest location, and toggle between air/sea/space modes

## Tech Stack

- **[Next.js 15](https://nextjs.org)** - React framework with App Router
- **[tRPC](https://trpc.io)** - End-to-end type-safe APIs
- **[TypeScript](https://www.typescriptlang.org/)** - Type safety
- **[Tailwind CSS](https://tailwindcss.com)** - Styling
- **[React Leaflet](https://react-leaflet.js.org/)** - Interactive maps
- **[React Query](https://tanstack.com/query)** - Data fetching and caching

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Then edit `.env` with your API credentials:

#### Required

```env
# Pantheon Content Publisher
# Get your token and site ID from https://content.pantheon.io
NEXT_PUBLIC_PCC_TOKEN="your-token-here"
NEXT_PUBLIC_PCC_SITE_ID="your-site-id-here"
```

#### Optional (for enhanced features)

```env
# OpenSky Network API - For higher rate limits (4000+ credits/day)
# Sign up at https://opensky-network.org/
OPENSKY_CLIENT_ID="your-client-id"
OPENSKY_CLIENT_SECRET="your-client-secret"

# AISStream - For ship tracking
# Get free API key at https://aisstream.io
AISSTREAM_API_KEY="your-api-key"

# N2YO - For satellite tracking
# Get free API key at https://www.n2yo.com/api/
N2YO_API_KEY="your-api-key"
```

#### Refresh Intervals (optional, defaults provided)

All values in milliseconds:

```env
# Server-side article cache duration (default: 60000 = 1 minute)
ARTICLES_CACHE_DURATION=60000

# Client-side cache durations
NEXT_PUBLIC_ARTICLES_STALE_TIME=60000
NEXT_PUBLIC_AIRCRAFT_DETAILS_STALE_TIME=300000

# API refetch intervals
NEXT_PUBLIC_FLIGHTS_REFETCH_INTERVAL=60000
NEXT_PUBLIC_WEATHER_REFETCH_INTERVAL=300000
NEXT_PUBLIC_SHIPS_REFETCH_INTERVAL=60000
NEXT_PUBLIC_SATELLITES_REFETCH_INTERVAL=60000

# Map bounds update delay (default: 30000 = 30 seconds)
NEXT_PUBLIC_MAP_BOUNDS_DEBOUNCE=30000
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to view the app.

### 4. Configure Airline Data (Optional)

Edit airline colors and names in `src/data/airlines.json`:

```json
{
  "airlines": {
    "UAL": { "name": "United Airlines", "color": "#0033a0" },
    "DAL": { "name": "Delta Air Lines", "color": "#003a70" }
  }
}
```

Add airports to `src/data/airports.json` for the search feature.

## Available Scripts

- `npm run dev` - Start development server (Turbo mode)
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint
- `npm run typecheck` - Run TypeScript compiler check

## API Data Sources

- **OpenSky Network**: Civilian aircraft positions (free tier available)
- **ADSB.lol**: Military aircraft data (no API key required)
- **AISStream**: Real-time ship positions via WebSocket
- **N2YO**: Satellite tracking data
- **Aviation Weather Center**: METAR weather observations
- **Pantheon Content Publisher**: Airline and aircraft information CMS
- **WordPress/Pantheon**: Aircraft metadata lookup

## Learn More

- [T3 Stack Documentation](https://create.t3.gg/)
- [Next.js Documentation](https://nextjs.org/docs)
- [tRPC Documentation](https://trpc.io/docs)
- [React Leaflet Documentation](https://react-leaflet.js.org/)

## License

MIT
