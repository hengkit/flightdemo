"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { useEffect, useState } from "react";
import { api } from "~/trpc/react";
import L from "leaflet";
import airlineData from "~/data/airlines.json";
import airportsData from "~/data/airports.json";

interface FlightMapProps {
  center?: LatLngExpression;
  zoom?: number;
  className?: string;
}

interface Airport {
  code: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lon: number;
}

// Load airline data from JSON file
const AIRLINES = airlineData.airlines as Record<string, { name: string; color: string | null }>;
const SPECIAL_COLORS = airlineData.specialColors;
const AIRPORTS = airportsData as Airport[];

// Calculate distance between two coordinates using Haversine formula
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Find nearest airport to given coordinates
function findNearestAirport(lat: number, lon: number): Airport {
  let nearestAirport = AIRPORTS[0]!;
  let minDistance = calculateDistance(lat, lon, nearestAirport.lat, nearestAirport.lon);

  for (const airport of AIRPORTS) {
    const distance = calculateDistance(lat, lon, airport.lat, airport.lon);
    if (distance < minDistance) {
      minDistance = distance;
      nearestAirport = airport;
    }
  }

  return nearestAirport;
}

// Extract airline code from callsign (usually first 3 letters)
function getAirlineCode(callsign: string | null): string | null {
  if (!callsign) return null;
  const match = callsign.match(/^([A-Z]{3})/);
  return match ? match[1] : null;
}

// Get airline name from code
function getAirlineName(airlineCode: string | null): string | null {
  if (!airlineCode) return null;
  return AIRLINES[airlineCode]?.name ?? null;
}

// Generate a consistent color for unknown airlines using hash
function hashStringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }

  const hue = Math.abs(hash % 360);
  const saturation = 65 + (Math.abs(hash) % 20); // 65-85%
  const lightness = 45 + (Math.abs(hash >> 8) % 15); // 45-60%

  return `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

// Detect if aircraft is private (general aviation)
function isPrivateAircraft(callsign: string | null): boolean {
  if (!callsign) return false;

  // Private aircraft patterns:
  // - Starts with N followed by numbers (US registration)
  // - Single letter followed by dash and numbers (e.g., N-12345)
  // - Less than 3 letters or no recognizable airline code
  const trimmed = callsign.trim();

  // US registration pattern: N followed by 1-5 alphanumeric characters
  if (/^N[0-9A-Z]{1,5}$/i.test(trimmed)) return true;

  // Other patterns that indicate private/general aviation
  if (trimmed.length < 3) return true;

  return false;
}

// Get color for an airline
function getAirlineColor(callsign: string | null, isMilitary?: boolean): string {
  // Military flights get olive/military green color
  if (isMilitary) {
    return SPECIAL_COLORS.military;
  }

  // Check if it's a private aircraft
  if (isPrivateAircraft(callsign)) {
    return SPECIAL_COLORS.private;
  }

  const airlineCode = getAirlineCode(callsign);

  if (airlineCode && AIRLINES[airlineCode]?.color) {
    return AIRLINES[airlineCode].color!;
  }

  // Generate consistent color for unknown airlines
  if (airlineCode) {
    return hashStringToColor(airlineCode);
  }

  return SPECIAL_COLORS.unknown; // Gray for flights without callsign
}

// Custom airplane icon
const createAirplaneIcon = (rotation: number, color: string) => {
  return L.divIcon({
    html: `
      <div style="transform: rotate(${rotation}deg); width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 28px; height: 28px;">
          <!-- Airplane body -->
          <path d="M16 3 L16 22" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
          <!-- Wings (swept back) -->
          <path d="M5 15 L16 13 L27 15" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- Tail wings (smaller) -->
          <path d="M11 21 L16 21.5 L21 21" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- Nose cone -->
          <circle cx="16" cy="3" r="2" fill="#ef4444"/>
          <!-- Wing tips -->
          <circle cx="5" cy="15" r="1.5" fill="${color}"/>
          <circle cx="27" cy="15" r="1.5" fill="${color}"/>
        </svg>
      </div>
    `,
    className: "airplane-icon",
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
};

// Component for location-based controls
function LocationControl() {
  const map = useMap();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nearestAirport, setNearestAirport] = useState<Airport | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<Airport[]>([]);
  const [mapCenter, setMapCenter] = useState<{ lat: number; lon: number } | null>(null);

  // Track map center changes and find nearest airport for weather
  useEffect(() => {
    const updateCenterAndAirport = () => {
      const center = map.getCenter();
      setMapCenter({ lat: center.lat, lon: center.lng });

      // Find nearest airport to the map center for weather display
      const airport = findNearestAirport(center.lat, center.lng);
      setNearestAirportForWeather(airport);
    };

    // Set initial center and airport
    updateCenterAndAirport();

    // Listen for map movements
    map.on("moveend", updateCenterAndAirport);

    return () => {
      map.off("moveend", updateCenterAndAirport);
    };
  }, [map]);

  const [nearestAirportForWeather, setNearestAirportForWeather] = useState<Airport | null>(null);

  const handleFindNearestAirport = () => {
    setLoading(true);
    setError(null);

    if (!navigator.geolocation) {
      setError("Geolocation is not supported by your browser");
      setLoading(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const airport = findNearestAirport(latitude, longitude);
        setNearestAirport(airport);

        // Center map on the airport
        map.setView([airport.lat, airport.lon], 10, {
          animate: true,
          duration: 1,
        });

        setLoading(false);
      },
      (err) => {
        setError("Unable to retrieve your location");
        console.error("Geolocation error:", err);
        setLoading(false);
      },
    );
  };

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    setError(null);

    if (value.length < 2) {
      setSearchResults([]);
      return;
    }

    // Search airports by code or city name
    const results = AIRPORTS.filter(
      (airport) =>
        airport.code.toLowerCase().includes(value.toLowerCase()) ||
        airport.city.toLowerCase().includes(value.toLowerCase()) ||
        airport.name.toLowerCase().includes(value.toLowerCase()),
    ).slice(0, 5); // Limit to 5 results

    setSearchResults(results);
  };

  const handleSelectAirport = (airport: Airport) => {
    setNearestAirport(airport);
    setSearchInput("");
    setSearchResults([]);
    setError(null);

    // Center map on the selected airport
    map.setView([airport.lat, airport.lon], 10, {
      animate: true,
      duration: 1,
    });
  };

  // Fetch weather data for nearest airport
  const { data: weather } = api.flights.getWeather.useQuery(
    {
      latitude: nearestAirportForWeather?.lat ?? 0,
      longitude: nearestAirportForWeather?.lon ?? 0,
    },
    {
      enabled: nearestAirportForWeather !== null,
      refetchInterval: 300000, // Refetch every 5 minutes
      staleTime: 300000, // Consider data fresh for 5 minutes
    },
  );

  return (
    <div className="leaflet-top leaflet-right" style={{ marginTop: "10px", marginRight: "10px" }}>
      {/* Search Input */}
      <div className="leaflet-control leaflet-bar mb-2" style={{ background: "white", padding: "8px" }}>
        <input
          type="text"
          value={searchInput}
          onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Search airport or city..."
          className="w-full px-2 py-1 text-sm border-0 outline-none"
          style={{ minWidth: "200px" }}
        />
        {searchResults.length > 0 && (
          <div
            className="mt-1 border-t"
            style={{ maxHeight: "200px", overflowY: "auto" }}
          >
            {searchResults.map((airport) => (
              <button
                key={airport.code}
                onClick={() => handleSelectAirport(airport)}
                className="w-full text-left px-2 py-2 text-xs hover:bg-gray-100"
                style={{ border: "none", cursor: "pointer", background: "transparent" }}
              >
                <div className="font-semibold">{airport.code}</div>
                <div className="text-gray-600">{airport.city}, {airport.country}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Nearest Airport Button */}
      <div className="leaflet-control leaflet-bar" style={{ background: "white", padding: "0" }}>
        <button
          onClick={handleFindNearestAirport}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
          style={{ border: "none", cursor: loading ? "not-allowed" : "pointer" }}
          title="Find nearest airport"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
            <circle cx="12" cy="10" r="3" />
          </svg>
          {loading ? "Finding..." : "Nearest Airport"}
        </button>
      </div>

      {/* Selected Airport Info */}
      {nearestAirport && (
        <div
          className="leaflet-control leaflet-bar mt-2"
          style={{ background: "white", padding: "8px 12px", maxWidth: "250px" }}
        >
          <p className="text-xs font-semibold">{nearestAirport.code}</p>
          <p className="text-xs text-gray-600">{nearestAirport.name}</p>
          <p className="text-xs text-gray-500">{nearestAirport.city}, {nearestAirport.country}</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div
          className="leaflet-control leaflet-bar mt-2"
          style={{ background: "#fee", padding: "8px 12px", maxWidth: "250px" }}
        >
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Weather Information */}
      {weather && nearestAirportForWeather && (
        <div
          className="leaflet-control leaflet-bar mt-2"
          style={{ background: "white", padding: "8px 12px", maxWidth: "250px" }}
        >
          <div className="flex items-start gap-2">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="mt-0.5 flex-shrink-0"
            >
              <path d="M12 2v2" />
              <path d="M12 20v2" />
              <path d="m4.93 4.93 1.41 1.41" />
              <path d="m17.66 17.66 1.41 1.41" />
              <path d="M2 12h2" />
              <path d="M20 12h2" />
              <path d="m6.34 17.66-1.41 1.41" />
              <path d="m19.07 4.93-1.41 1.41" />
            </svg>
            <div className="flex-1">
              <p className="text-xs font-semibold text-gray-900">
                {nearestAirportForWeather.code} - {weather.location}
              </p>
              <p className="text-xs text-gray-600 mt-0.5">
                {weather.temperature}°{weather.temperatureUnit} - {weather.shortForecast}
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                Wind: {weather.windSpeed} {weather.windDirection}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FlightMarkers({ bounds }: { bounds: { lamin: number; lomin: number; lamax: number; lomax: number } }) {
  const { data: civilianFlights, refetch: refetchCivilian } = api.flights.getFlights.useQuery(bounds, {
    refetchInterval: 60000, // Refetch every 1 minute
  });

  const { data: militaryFlights, refetch: refetchMilitary } = api.flights.getMilitaryFlights.useQuery(undefined, {
    refetchInterval: 60000, // Refetch every 1 minute
  });

  useEffect(() => {
    const interval = setInterval(() => {
      void refetchCivilian();
      void refetchMilitary();
    }, 60000);
    return () => clearInterval(interval);
  }, [refetchCivilian, refetchMilitary]);

  // Combine and deduplicate flights
  // Prefer military data from ADSB.lol over OpenSky data for the same aircraft
  const flightMap = new Map<string, typeof civilianFlights extends (infer T)[] ? T : never>();

  // Add civilian flights first
  (civilianFlights ?? []).forEach((flight) => {
    flightMap.set(flight.icao24, flight);
  });

  // Add military flights, overwriting any duplicates from civilian data
  (militaryFlights ?? []).forEach((flight) => {
    flightMap.set(flight.icao24, flight);
  });

  const allFlights = Array.from(flightMap.values());

  if (allFlights.length === 0) return null;

  return (
    <>
      {allFlights.map((flight) => {
        if (flight.latitude === null || flight.longitude === null) return null;

        const position: LatLngExpression = [flight.latitude, flight.longitude];
        const rotation = flight.true_track ?? 0;
        const airlineColor = getAirlineColor(flight.callsign, flight.is_military);
        const airlineCode = getAirlineCode(flight.callsign);
        const airlineName = getAirlineName(airlineCode);
        const isPrivate = isPrivateAircraft(flight.callsign);

        return (
          <Marker
            key={flight.icao24}
            position={position}
            icon={createAirplaneIcon(rotation, airlineColor)}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-bold">
                  {flight.callsign || "Unknown Flight"}
                </p>
                {flight.is_military && (
                  <p className="text-xs font-semibold" style={{ color: airlineColor }}>
                    ✈ MILITARY
                  </p>
                )}
                {isPrivate && !flight.is_military && (
                  <p className="text-xs font-semibold" style={{ color: airlineColor }}>
                    ✈ PRIVATE
                  </p>
                )}
                {flight.aircraft_type && (
                  <p className="text-xs">Type: {flight.aircraft_type}</p>
                )}
                {flight.registration && (
                  <p className="text-xs">Registration: {flight.registration}</p>
                )}
                {!flight.is_military && !isPrivate && (airlineName || airlineCode) && (
                  <p className="text-xs" style={{ color: airlineColor }}>
                    Airline: {airlineName || airlineCode}
                  </p>
                )}
                <p>Country: {flight.origin_country}</p>
                <p>ICAO24: {flight.icao24}</p>
                {flight.velocity !== null && (
                  <p>Velocity: {Math.round(flight.velocity * 3.6)} km/h</p>
                )}
                {flight.baro_altitude !== null && (
                  <p>Altitude: {Math.round(flight.baro_altitude)} m</p>
                )}
                <p>On Ground: {flight.on_ground ? "Yes" : "No"}</p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

// Component to track map bounds and update flight data
function MapBoundsTracker() {
  const map = useMap();
  const [bounds, setBounds] = useState({
    lamin: 37.0,
    lomin: -123.0,
    lamax: 38.5,
    lomax: -121.5,
  });

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;

    const updateBounds = () => {
      const mapBounds = map.getBounds();
      const sw = mapBounds.getSouthWest();
      const ne = mapBounds.getNorthEast();

      setBounds({
        lamin: sw.lat,
        lomin: sw.lng,
        lamax: ne.lat,
        lomax: ne.lng,
      });
    };

    const debouncedUpdateBounds = () => {
      // Clear any existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Set a new timeout to update bounds after 10 seconds
      timeoutId = setTimeout(() => {
        updateBounds();
      }, 10000);
    };

    // Set initial bounds immediately
    updateBounds();

    // Debounce bounds updates when map moves or zooms
    map.on("moveend", debouncedUpdateBounds);
    map.on("zoomend", debouncedUpdateBounds);

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
      map.off("moveend", debouncedUpdateBounds);
      map.off("zoomend", debouncedUpdateBounds);
    };
  }, [map]);

  return <FlightMarkers bounds={bounds} />;
}

export function FlightMap({
  center = [37.7749, -122.4194],
  zoom = 10,
  className = "h-96 w-full"
}: FlightMapProps) {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);

    // Fix for default marker icons in Next.js
    import("leaflet").then((L) => {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
        iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
        shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
      });
    });
  }, []);

  if (!isClient) {
    return (
      <div className={`flex items-center justify-center bg-gray-100 ${className}`}>
        <p className="text-gray-500">Loading map...</p>
      </div>
    );
  }

  return (
    <MapContainer
      center={center}
      zoom={zoom}
      scrollWheelZoom={true}
      className={className}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <LocationControl />
      <MapBoundsTracker />
    </MapContainer>
  );
}
