"use client";

import { MapContainer, TileLayer, Marker, Popup, useMap, ZoomControl } from "react-leaflet";
import type { LatLngExpression } from "leaflet";
import { useEffect, useState } from "react";
import { api } from "~/trpc/react";
import L from "leaflet";
import airlineData from "~/data/airlines.json";
import airportsData from "~/data/airports.json";
import React from "react";
import { env } from "~/env";

interface ContentNode {
  tag?: string;
  data?: string | null;
  children?: ContentNode[] | null;
  style?: string[] | null;
  attrs?: Record<string, string> | null;
}

interface ContentStructure {
  version?: string;
  children?: ContentNode[];
}

function ContentRenderer({ content }: { content: string | null | undefined }) {
  if (!content) return null;

  // Try to parse as JSON
  let parsedContent: ContentStructure;
  try {
    parsedContent = JSON.parse(content) as ContentStructure;
  } catch {
    // If not JSON, render as HTML
    return <div dangerouslySetInnerHTML={{ __html: content }} />;
  }

  const renderNode = (node: ContentNode, index: number): React.ReactNode => {
    // If it's just text data
    if (node.data && !node.tag) {
      return node.data;
    }

    // Skip style tags
    if (node.tag === "style") {
      return null;
    }

    const Tag = (node.tag || "span") as keyof JSX.IntrinsicElements;
    const styleObj: React.CSSProperties = {};

    // Parse inline styles
    if (node.style) {
      node.style.forEach((styleStr) => {
        const [key, value] = styleStr.split(":");
        if (key && value) {
          const camelKey = key.trim().replace(/-([a-z])/g, (g) => g[1]!.toUpperCase());
          styleObj[camelKey as keyof React.CSSProperties] = value.trim() as never;
        }
      });
    }

    // Build props and convert class to className for React
    const attrs = { ...(node.attrs || {}) };
    if (attrs.class) {
      attrs.className = attrs.class;
      delete attrs.class;
    }

    const props: Record<string, unknown> = {
      key: index,
      ...attrs,
      style: Object.keys(styleObj).length > 0 ? styleObj : undefined,
    };

    // Render children
    const children = node.children
      ? node.children.map((child, i) => renderNode(child, i))
      : node.data || null;

    return React.createElement(Tag, props, children);
  };

  return (
    <div className="prose prose-sm max-w-none">
      {parsedContent.children?.map((node, i) => renderNode(node, i))}
    </div>
  );
}

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
function getAirlineCode(callsign: string | null): string | null | undefined {
  if (!callsign) return null;
  const match = callsign.match(/^([A-Z]{3})/);
  return match ? match[1] : null;
}

// Get airline name from code
function getAirlineName(airlineCode: string | null | undefined): string | null {
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
const createAirplaneIcon = (rotation: number, color: string, sizeMultiplier: number = 1) => {
  const baseSize = 28 * sizeMultiplier;
  const containerSize = 32 * sizeMultiplier;
  return L.divIcon({
    html: `
      <div style="transform: rotate(${rotation}deg); width: ${containerSize}px; height: ${containerSize}px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: ${baseSize}px; height: ${baseSize}px;">
          <!-- Airplane body -->
          <path d="M16 3 L16 22" stroke="${color}" stroke-width="2.5" stroke-linecap="round"/>
          <!-- Wings (swept back) -->
          <path d="M5 15 L16 13 L27 15" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- Tail wings (smaller) -->
          <path d="M11 21 L16 21.5 L21 21" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
          <!-- Wing tips -->
          <circle cx="5" cy="15" r="1.5" fill="${color}"/>
          <circle cx="27" cy="15" r="1.5" fill="${color}"/>
        </svg>
      </div>
    `,
    className: "airplane-icon",
    iconSize: [containerSize, containerSize],
    iconAnchor: [containerSize / 2, containerSize / 2],
  });
};

// Custom helicopter icon (top-down view)
const createHelicopterIcon = (rotation: number, color: string, sizeMultiplier: number = 1) => {
  const baseSize = 28 * sizeMultiplier;
  const containerSize = 32 * sizeMultiplier;
  return L.divIcon({
    html: `
      <div style="transform: rotate(${rotation}deg); width: ${containerSize}px; height: ${containerSize}px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: ${baseSize}px; height: ${baseSize}px;">
          <!-- Main rotor (cross) -->
          <line x1="16" y1="2" x2="16" y2="22" stroke="${color}" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
          <line x1="6" y1="12" x2="26" y2="12" stroke="${color}" stroke-width="2" stroke-linecap="round" opacity="0.5"/>
          <!-- Body -->
          <circle cx="16" cy="12" r="8" stroke="${color}" stroke-width="2" fill="none"/>
          <!-- Tail -->
          <line x1="16" y1="20" x2="16" y2="28" stroke="${color}" stroke-width="2" stroke-linecap="round"/>
          <line x1="14" y1="28" x2="18" y2="28" stroke="${color}" stroke-width="1.5" stroke-linecap="round"/>
        </svg>
      </div>
    `,
    className: "helicopter-icon",
    iconSize: [containerSize, containerSize],
    iconAnchor: [containerSize / 2, containerSize / 2],
  });
};

// Custom ship icon (top-down hull view)
const createShipIcon = (rotation: number) => {
  return L.divIcon({
    html: `
      <div style="transform: rotate(${rotation}deg); width: 26px; height: 26px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 22px; height: 22px;">
          <!-- Hull shape (top-down view) -->
          <path d="M16 4 L20 10 L22 16 L22 22 L20 26 L16 28 L12 26 L10 22 L10 16 L12 10 Z"
                fill="#1e40af"
                stroke="#1e3a8a"
                stroke-width="1.5"/>
        </svg>
      </div>
    `,
    className: "ship-icon",
    iconSize: [26, 26],
    iconAnchor: [13, 13],
  });
};

// Custom satellite icon
const createSatelliteIcon = () => {
  return L.divIcon({
    html: `
      <div style="width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg" style="width: 20px; height: 20px;">
          <!-- Satellite body -->
          <rect x="12" y="12" width="8" height="8" fill="#7c3aed" stroke="#6d28d9" stroke-width="1.5"/>
          <!-- Solar panels -->
          <rect x="4" y="10" width="6" height="12" fill="#a78bfa" stroke="#6d28d9" stroke-width="1"/>
          <rect x="22" y="10" width="6" height="12" fill="#a78bfa" stroke="#6d28d9" stroke-width="1"/>
          <!-- Antenna -->
          <line x1="16" y1="12" x2="16" y2="6" stroke="#6d28d9" stroke-width="1.5"/>
          <circle cx="16" cy="6" r="1.5" fill="#6d28d9"/>
        </svg>
      </div>
    `,
    className: "satellite-icon",
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
};

// Component for location-based controls
function LocationControl() {
  const map = useMap();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchInput, setSearchInput] = useState("");
  const [searchResults, setSearchResults] = useState<Airport[]>([]);
  const [weatherTab, setWeatherTab] = useState<"formatted" | "raw">("formatted");

  // Track map center changes and find nearest airport for weather
  useEffect(() => {
    const updateCenterAndAirport = () => {
      const center = map.getCenter();

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
    setSearchInput("");
    setSearchResults([]);
    setError(null);

    // Center map on the selected airport
    map.setView([airport.lat, airport.lon], 10, {
      animate: true,
      duration: 1,
    });
  };

  // Convert IATA to ICAO code (for US airports, prepend 'K')
  const getICAOCode = (airport: Airport | null): string => {
    if (!airport) return "";
    // For US airports, ICAO code is typically 'K' + IATA code
    if (airport.country === "USA") {
      return `K${airport.code}`;
    }
    // For other countries, we'd need a mapping table
    // For now, just return the code as-is
    return airport.code;
  };

  // Fetch weather data for nearest airport
  const { data: weather } = api.flights.getWeather.useQuery(
    {
      airportCode: getICAOCode(nearestAirportForWeather),
    },
    {
      enabled: nearestAirportForWeather !== null,
      refetchInterval: env.NEXT_PUBLIC_WEATHER_REFETCH_INTERVAL,
      staleTime: env.NEXT_PUBLIC_WEATHER_REFETCH_INTERVAL,
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
          style={{ background: "white", padding: "0", maxWidth: "250px" }}
        >
          {/* Tabs */}
          <div style={{ display: "flex", borderBottom: "1px solid #e5e7eb" }}>
            <button
              onClick={() => setWeatherTab("formatted")}
              className={`flex-1 px-3 py-2 text-xs font-medium ${
                weatherTab === "formatted"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              style={{ border: "none", cursor: "pointer", background: "transparent" }}
            >
              Conditions
            </button>
            <button
              onClick={() => setWeatherTab("raw")}
              className={`flex-1 px-3 py-2 text-xs font-medium ${
                weatherTab === "raw"
                  ? "text-blue-600 border-b-2 border-blue-600"
                  : "text-gray-600 hover:text-gray-900"
              }`}
              style={{ border: "none", cursor: "pointer", background: "transparent" }}
            >
              METAR
            </button>
          </div>

          {/* Tab Content */}
          <div style={{ padding: "8px 12px" }}>
            {weatherTab === "formatted" ? (
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
                  <p className="text-xs text-gray-500 mt-0.5">
                    Visibility: {weather.visibility} SM
                  </p>
                </div>
              </div>
            ) : (
              <div>
                <p className="text-xs font-semibold text-gray-900 mb-2">
                  {nearestAirportForWeather.code}
                </p>
                <p className="text-xs text-gray-700 font-mono leading-relaxed break-words">
                  {weather.detailedForecast}
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Component to display aircraft details from the API
function AircraftDetails({
  aircraftDetails,
  onModelSelect
}: {
  aircraftDetails: { title: string; acf: Record<string, unknown> };
  onModelSelect?: (modelName: string, typeCode: string) => void;
}) {
  // Get typecode from aircraft details
  const typeCode = aircraftDetails.acf?.typecode as string | undefined;

  // Format field name from snake_case to Title Case
  const formatFieldName = (key: string): string => {
    // Special field name mappings
    const fieldNameMap: Record<string, string> = {
      manufacturername: 'Manufacturer',
      typecode: 'Type Code',
      modelname: 'Model Name',
      model_name: 'Model Name',
      model: 'Model',
      icaoaircraftclass: 'ICAO Aircraft Class',
    };

    const lowerKey = key.toLowerCase();
    if (fieldNameMap[lowerKey]) {
      return fieldNameMap[lowerKey];
    }

    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Filter out blank/empty values and unwanted fields
  const validEntries = aircraftDetails.acf
    ? Object.entries(aircraftDetails.acf).filter(([key, value]) => {
        // Skip these fields
        if (['icao24', 'registration', 'built', 'typecode', 'icaoaircraftclass'].includes(key.toLowerCase())) {
          return false;
        }
        const stringValue = String(value).trim();
        return stringValue !== '' && stringValue !== 'false' && stringValue !== '0';
      })
    : [];

  return (
    <div className="mt-2 pt-2 border-t border-gray-200">
      {validEntries.length > 0 && (
        <div className="mt-1">
          {validEntries.map(([key, value]) => {
            // Check for model name variations
            const lowerKey = key.toLowerCase().replace(/[_\s-]/g, '');
            const isModelName = lowerKey === 'modelname' || lowerKey === 'model';
            return (
              <p key={key} className="text-xs text-gray-600">
                {formatFieldName(key)}:{' '}
                {isModelName && onModelSelect && typeCode ? (
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      onModelSelect(String(value), typeCode);
                    }}
                    style={{ color: '#374151', textDecoration: 'underline', cursor: 'pointer' }}
                  >
                    {String(value)}
                  </a>
                ) : (
                  String(value)
                )}
              </p>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Component for individual aircraft marker with helicopter detection
function AircraftMarker({
  flight,
  position,
  rotation,
  airlineColor,
  airlineCode,
  airlineName,
  isPrivate,
  onFlightSelect,
  onModelSelect
}: {
  flight: {
    icao24: string;
    callsign: string | null;
    is_military?: boolean;
    aircraft_type?: string | null;
    registration?: string | null;
    origin_country: string;
    velocity: number | null;
    baro_altitude: number | null;
    geo_altitude: number | null;
    true_track: number | null;
    vertical_rate: number | null;
    on_ground: boolean;
    squawk: string | null;
    category: number | null;
    position_source: number;
    time_position: number | null;
    last_contact: number;
    sensors: number[] | null;
    spi: boolean;
  };
  position: LatLngExpression;
  rotation: number;
  airlineColor: string;
  airlineCode: string | null | undefined;
  airlineName: string | null;
  isPrivate: boolean;
  onFlightSelect: (flight: SelectedFlight) => void;
  onModelSelect: (modelName: string, typeCode: string) => void;
}) {
  const [popupOpen, setPopupOpen] = useState(false);

  // Fetch aircraft details immediately for all visible aircraft
  const { data: aircraftDetails } = api.flights.getAircraftDetails.useQuery(
    { icao24: flight.icao24 },
    {
      staleTime: env.NEXT_PUBLIC_AIRCRAFT_DETAILS_STALE_TIME,
      enabled: !!flight.icao24 && flight.icao24.trim() !== '',
    }
  );

  // Check if it's a helicopter based on icaoaircraftclass field
  const icaoAircraftClass = aircraftDetails?.acf?.icaoaircraftclass as string | undefined;
  const isHelicopter = icaoAircraftClass?.toUpperCase().startsWith('H') ?? false;

  // Calculate size multiplier based on icaoaircraftclass
  let sizeMultiplier = 1;
  if (icaoAircraftClass) {
    const classUpper = icaoAircraftClass.toUpperCase();
    // If ends with J, increase by 25%
    if (classUpper.endsWith('J')) {
      sizeMultiplier *= 1.25;
    }
  }

  return (
    <Marker
      position={position}
      icon={isHelicopter ? createHelicopterIcon(rotation, airlineColor, sizeMultiplier) : createAirplaneIcon(rotation, airlineColor, sizeMultiplier)}
      eventHandlers={{
        popupopen: () => setPopupOpen(true),
        popupclose: () => setPopupOpen(false),
      }}
    >
      <Popup>
        <div className="text-xs space-y-1">
          <p className="font-bold">
            {flight.callsign || "Unknown Flight"}
            {flight.is_military && (
              <span className="ml-2 font-semibold" style={{ color: airlineColor }}>
                ✈ MILITARY
              </span>
            )}
            {isPrivate && !flight.is_military && (
              <span className="ml-2 font-semibold" style={{ color: airlineColor }}>
                ✈ PRIVATE
              </span>
            )}
          </p>
          {!flight.is_military && !isPrivate && (airlineName || airlineCode) && (
            <p>
              <a
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  onFlightSelect({
                    callsign: flight.callsign,
                    airlineName: airlineName ?? null,
                    airlineCode: airlineCode ?? null,
                    airlineColor,
                    icao24: flight.icao24,
                    aircraftType: flight.aircraft_type ?? null,
                    registration: flight.registration ?? null,
                    originCountry: flight.origin_country,
                    velocity: flight.velocity,
                    baroAltitude: flight.baro_altitude,
                  });
                }}
                style={{ color: airlineColor, textDecoration: 'underline', cursor: 'pointer' }}
              >
                {airlineName || airlineCode}
              </a>
            </p>
          )}
          {(flight.aircraft_type || flight.registration) && (
            <p className="text-gray-600">
              {flight.aircraft_type}
              {flight.aircraft_type && flight.registration && " • "}
              {flight.registration}
            </p>
          )}

          <div className="mt-2 text-gray-600 space-y-0.5">
            {flight.velocity !== null && (
              <p><strong>Velocity:</strong> {Math.round(flight.velocity)} m/s ({Math.round(flight.velocity * 3.6)} km/h)</p>
            )}
            {flight.baro_altitude !== null && (
              <p><strong>Baro Altitude:</strong> {Math.round(flight.baro_altitude)} m</p>
            )}
            {flight.vertical_rate !== null && (
              <p><strong>Vertical Rate:</strong> {flight.vertical_rate.toFixed(1)} m/s</p>
            )}
          </div>

          {popupOpen && aircraftDetails && (
            <AircraftDetails aircraftDetails={aircraftDetails} onModelSelect={onModelSelect} />
          )}
        </div>
      </Popup>
    </Marker>
  );
}

function FlightMarkers({
  bounds,
  enabled,
  onFlightSelect,
  onModelSelect
}: {
  bounds: { lamin: number; lomin: number; lamax: number; lomax: number };
  enabled: boolean;
  onFlightSelect: (flight: SelectedFlight) => void;
  onModelSelect: (modelName: string, typeCode: string) => void;
}) {
  // Fetch all flights (civilian + military) in one API call
  const { data: allFlights, refetch } = api.flights.getFlights.useQuery(bounds, {
    refetchInterval: enabled ? env.NEXT_PUBLIC_FLIGHTS_REFETCH_INTERVAL : false,
    enabled,
  });

  // Trigger immediate refetch when enabled changes to true
  useEffect(() => {
    if (enabled) {
      void refetch();
    }
  }, [enabled, refetch]);

  // Don't render markers if not enabled
  if (!enabled) return null;

  if (!allFlights || allFlights.length === 0) return null;

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
          <AircraftMarker
            key={flight.icao24}
            flight={flight}
            position={position}
            rotation={rotation}
            airlineColor={airlineColor}
            airlineCode={airlineCode}
            airlineName={airlineName}
            isPrivate={isPrivate}
            onFlightSelect={onFlightSelect}
            onModelSelect={onModelSelect}
          />
        );
      })}
    </>
  );
}

function ShipMarkers({ bounds, enabled }: { bounds: { lamin: number; lomin: number; lamax: number; lomax: number }; enabled: boolean }) {
  const { data: ships, refetch } = api.ships.getShips.useQuery(bounds, {
    refetchInterval: enabled ? env.NEXT_PUBLIC_SHIPS_REFETCH_INTERVAL : false,
    enabled,
  });

  // Trigger immediate refetch when enabled changes to true
  useEffect(() => {
    if (enabled) {
      void refetch();
    }
  }, [enabled, refetch]);

  // Don't render markers if not enabled
  if (!enabled) return null;

  if (!ships || ships.length === 0) return null;

  // Format ETA string
  const formatETA = (eta: string | null) => {
    if (!eta) return null;
    try {
      // If it's already a string, return it
      if (typeof eta === 'string') return eta;
      // If it's an object with Day, Hour, Minute, Month properties
      const etaObj = eta as unknown as { Day?: number; Hour?: number; Minute?: number; Month?: number };
      if (etaObj.Month && etaObj.Day && etaObj.Hour !== undefined && etaObj.Minute !== undefined) {
        return `${etaObj.Month}/${etaObj.Day} ${String(etaObj.Hour).padStart(2, '0')}:${String(etaObj.Minute).padStart(2, '0')}`;
      }
      return null;
    } catch {
      return null;
    }
  };

  return (
    <>
      {ships.map((ship) => {
        const position: LatLngExpression = [ship.latitude, ship.longitude];
        const rotation = ship.cog ?? ship.heading ?? 0;
        const formattedETA = formatETA(ship.eta);

        return (
          <Marker
            key={ship.mmsi}
            position={position}
            icon={createShipIcon(rotation)}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-bold">
                  {ship.shipName || `MMSI: ${ship.mmsi}`}
                </p>
                <p className="text-xs font-semibold text-blue-600">
                  🚢 VESSEL
                </p>
                <p>MMSI: {ship.mmsi}</p>
                {ship.destination && (
                  <p>Destination: {ship.destination}</p>
                )}
                {ship.sog !== null && (
                  <p>Speed: {ship.sog.toFixed(1)} knots</p>
                )}
                {ship.cog !== null && (
                  <p>Course: {ship.cog.toFixed(0)}°</p>
                )}
                {ship.heading !== null && (
                  <p>Heading: {ship.heading}°</p>
                )}
                {formattedETA && (
                  <p>ETA: {formattedETA}</p>
                )}
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

function SatelliteMarkers({
  latitude,
  longitude,
  enabled
}: {
  latitude: number;
  longitude: number;
  enabled: boolean;
}) {
  const { data: satellites, refetch } = api.satellites.getSatellites.useQuery(
    {
      latitude,
      longitude,
      altitude: 0, // Sea level
      searchRadius: 45, // 45 degrees above horizon
      categoryId: 0, // All categories
    },
    {
      enabled, // Only fetch when space mode is enabled
      refetchInterval: enabled ? env.NEXT_PUBLIC_SATELLITES_REFETCH_INTERVAL : false,
    }
  );

  // Trigger immediate refetch when enabled changes to true
  useEffect(() => {
    if (enabled) {
      void refetch();
    }
  }, [enabled, refetch]);

  // Don't render markers if not enabled
  if (!enabled) return null;

  if (!satellites || satellites.length === 0) return null;

  return (
    <>
      {satellites.map((satellite) => {
        const position: LatLngExpression = [satellite.satlat, satellite.satlng];

        return (
          <Marker
            key={satellite.satid}
            position={position}
            icon={createSatelliteIcon()}
          >
            <Popup>
              <div className="text-sm">
                <p className="font-bold">
                  {satellite.satname}
                </p>
                <p className="text-xs font-semibold text-purple-600">
                  🛰️ SATELLITE
                </p>
                <p className="text-xs">NORAD ID: {satellite.satid}</p>
                {satellite.intDesignator && (
                  <p className="text-xs">Designator: {satellite.intDesignator}</p>
                )}
                {satellite.launchDate && (
                  <p className="text-xs">Launched: {satellite.launchDate}</p>
                )}
                <p className="text-xs">Altitude: {satellite.satalt.toFixed(1)} km</p>
                <p className="text-xs">
                  Position: {satellite.satlat.toFixed(2)}°, {satellite.satlng.toFixed(2)}°
                </p>
              </div>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}

// Component to track map bounds and update flight data
function MapBoundsTracker({
  viewMode,
  onFlightSelect,
  onModelSelect
}: {
  viewMode: "airplanes" | "ships" | "space";
  onFlightSelect: (flight: SelectedFlight) => void;
  onModelSelect: (modelName: string, typeCode: string) => void;
}) {
  const map = useMap();
  const [bounds, setBounds] = useState({
    lamin: 37.0,
    lomin: -123.0,
    lamax: 38.5,
    lomax: -121.5,
  });
  const [center, setCenter] = useState({
    latitude: 37.7749,
    longitude: -122.4194,
  });
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | null = null;

    const updateBounds = () => {
      const mapBounds = map.getBounds();
      const sw = mapBounds.getSouthWest();
      const ne = mapBounds.getNorthEast();
      const mapCenter = map.getCenter();
      const currentZoom = map.getZoom();

      setBounds({
        lamin: sw.lat,
        lomin: sw.lng,
        lamax: ne.lat,
        lomax: ne.lng,
      });

      setCenter({
        latitude: mapCenter.lat,
        longitude: mapCenter.lng,
      });

      setZoom(currentZoom);
    };

    const debouncedUpdateBounds = () => {
      // Clear any existing timeout
      if (timeoutId) {
        clearTimeout(timeoutId);
      }

      // Set a new timeout to update bounds after debounce period
      timeoutId = setTimeout(() => {
        updateBounds();
      }, env.NEXT_PUBLIC_MAP_BOUNDS_DEBOUNCE);
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

  // Different zoom limits for different modes
  const shouldFetchFlights = zoom > 8;
  const shouldFetchShips = zoom > 8;
  const shouldFetchSatellites = zoom > 4;

  return (
    <>
      <FlightMarkers bounds={bounds} enabled={viewMode === "airplanes" && shouldFetchFlights} onFlightSelect={onFlightSelect} onModelSelect={onModelSelect} />
      <ShipMarkers bounds={bounds} enabled={viewMode === "ships" && shouldFetchShips} />
      <SatelliteMarkers latitude={center.latitude} longitude={center.longitude} enabled={viewMode === "space" && shouldFetchSatellites} />
    </>
  );
}

// Component to display zoom level notice
function ZoomNotice({ viewMode }: { viewMode: "airplanes" | "ships" | "space" }) {
  const map = useMap();
  const [zoom, setZoom] = useState(map.getZoom());

  useEffect(() => {
    const updateZoom = () => {
      setZoom(map.getZoom());
    };

    map.on("zoomend", updateZoom);
    return () => {
      map.off("zoomend", updateZoom);
    };
  }, [map]);

  // Different zoom requirements for different modes
  const zoomRequired = viewMode === "space" ? 4 : 8;

  if (zoom > zoomRequired) return null;

  return (
    <div
      style={{
        position: "absolute",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        zIndex: 1000,
        background: "rgba(255, 255, 255, 0.95)",
        borderRadius: "8px",
        boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
        padding: "16px 24px",
        textAlign: "center",
        pointerEvents: "none",
      }}
    >
      <div className="flex items-center gap-3">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ color: "#3b82f6" }}
        >
          <circle cx="11" cy="11" r="8" />
          <path d="m21 21-4.3-4.3" />
          <path d="M11 8v6" />
          <path d="M8 11h6" />
        </svg>
        <div>
          <p className="text-sm font-semibold text-gray-900">Zoom in for updates</p>
          <p className="text-xs text-gray-600">Use the map controls to see vehicles</p>
        </div>
      </div>
    </div>
  );
}

// View mode toggle control
function ViewModeControl({
  viewMode,
  onViewModeChange
}: {
  viewMode: "airplanes" | "ships" | "space";
  onViewModeChange: (mode: "airplanes" | "ships" | "space") => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "10px",
        left: "50%",
        transform: "translateX(-50%)",
        zIndex: 1000,
      }}
    >
      <div className="leaflet-control leaflet-bar" style={{ background: "white", padding: "4px" }}>
        <div style={{ display: "flex", gap: "4px" }}>
          <button
            onClick={() => onViewModeChange("airplanes")}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              viewMode === "airplanes"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
            style={{
              border: "none",
              cursor: "pointer",
              borderRadius: "4px",
            }}
            title="Show airplanes"
          >
            Air
          </button>
          <button
            onClick={() => onViewModeChange("ships")}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              viewMode === "ships"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
            style={{
              border: "none",
              cursor: "pointer",
              borderRadius: "4px",
            }}
            title="Show ships"
          >
            Sea
          </button>
          <button
            onClick={() => onViewModeChange("space")}
            className={`px-3 py-2 text-sm font-medium transition-colors ${
              viewMode === "space"
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-100"
            }`}
            style={{
              border: "none",
              cursor: "pointer",
              borderRadius: "4px",
            }}
            title="Show satellites"
          >
            Space
          </button>
        </div>
      </div>
    </div>
  );
}

interface SelectedFlight {
  callsign: string | null;
  airlineName: string | null;
  airlineCode: string | null;
  airlineColor: string;
  icao24: string;
  aircraftType: string | null;
  registration: string | null;
  originCountry: string;
  velocity: number | null;
  baroAltitude: number | null;
}

interface SelectedModel {
  modelName: string;
  typeCode: string;
}

// Airlines panel that appears in the bottom right
function AirlinesPanel({
  flight,
  onClose
}: {
  flight: SelectedFlight;
  onClose: () => void;
}) {
  // Fetch single article by slug (airline ICAO code)
  const slug = flight.airlineCode?.toLowerCase()?.trim() ?? "";
  const shouldFetch = slug.length > 0;

  const { data: article, isLoading: loading, refetch } = api.articles.getBySlug.useQuery(
    { slug: slug || "none" }, // Provide fallback to avoid empty string
    {
      enabled: shouldFetch, // Only fetch if we have a valid airline code
      staleTime: env.NEXT_PUBLIC_ARTICLES_STALE_TIME,
    }
  );

  const handleRefresh = async () => {
    await refetch();
  };

  return (
    <div
      className="airlines-panel-scroll"
      style={{
        position: "absolute",
        bottom: "10px",
        right: "10px",
        zIndex: 1000,
        background: "white",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        padding: "16px",
        maxWidth: "400px",
        maxHeight: "80vh",
        overflowY: "scroll",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-bold text-lg" style={{ color: flight.airlineColor }}>
          {article?.title || flight.airlineName || flight.airlineCode || "Unknown"}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            style={{
              border: "none",
              background: "transparent",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "16px",
              lineHeight: "1",
              padding: "4px",
              opacity: loading ? 0.5 : 1,
            }}
            title="Refresh article"
          >
            🔄
          </button>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "20px",
              lineHeight: "1",
              padding: "0",
            }}
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-600 mb-3">
        {flight.aircraftType && <p>Aircraft: {flight.aircraftType}</p>}
        {flight.registration && <p>Registration: {flight.registration}</p>}
      </div>

      <div className="border-t pt-3 flex-1 min-h-0">
        {loading ? (
          <p className="text-sm text-gray-500">Loading info...</p>
        ) : article ? (
          <div className="airlines-panel-content">
            {article.content && (
              <div className="text-sm">
                <ContentRenderer content={article.content} />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No information available.
            {flight.airlineCode && ` (Looking for slug: ${flight.airlineCode.toLowerCase()})`}
          </p>
        )}
      </div>
      <style>{`
        .airlines-panel-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .airlines-panel-scroll::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }
        .airlines-panel-scroll::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 4px;
        }
        .airlines-panel-scroll::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        .airlines-panel-content img {
          max-width: 100% !important;
          max-height: none !important;
          height: auto !important;
          border-radius: 4px;
          margin-top: 8px;
          margin-bottom: 8px;
          display: block;
        }
        .airlines-panel-content span {
          max-height: none !important;
        }
        .airlines-panel-content .prose img {
          max-width: 100%;
          height: auto;
        }
      `}</style>
    </div>
  );
}

// Model panel that appears in the bottom right
function ModelPanel({
  model,
  onClose
}: {
  model: SelectedModel;
  onClose: () => void;
}) {
  // Fetch single article by slug (aircraft type code)
  const slug = model.typeCode?.toLowerCase()?.trim() ?? "";
  const shouldFetch = slug.length > 0;

  const { data: article, isLoading: loading, refetch } = api.articles.getBySlug.useQuery(
    { slug: slug || "none" }, // Provide fallback to avoid empty string
    {
      enabled: shouldFetch, // Only fetch if we have a valid type code
      staleTime: env.NEXT_PUBLIC_ARTICLES_STALE_TIME,
    }
  );

  const handleRefresh = async () => {
    await refetch();
  };

  return (
    <div
      className="model-panel-scroll"
      style={{
        position: "absolute",
        bottom: "10px",
        right: "10px",
        zIndex: 1000,
        background: "white",
        borderRadius: "8px",
        boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
        padding: "16px",
        maxWidth: "400px",
        maxHeight: "80vh",
        overflowY: "scroll",
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <h3 className="font-bold text-lg text-blue-600">
          {article?.title || model.modelName}
        </h3>
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={loading}
            style={{
              border: "none",
              background: "transparent",
              cursor: loading ? "not-allowed" : "pointer",
              fontSize: "16px",
              lineHeight: "1",
              padding: "4px",
              opacity: loading ? 0.5 : 1,
            }}
            title="Refresh article"
          >
            🔄
          </button>
          <button
            onClick={onClose}
            style={{
              border: "none",
              background: "transparent",
              cursor: "pointer",
              fontSize: "20px",
              lineHeight: "1",
              padding: "0",
            }}
            title="Close"
          >
            ×
          </button>
        </div>
      </div>

      <div className="text-xs text-gray-600 mb-3">
        <p>Type Code: {model.typeCode}</p>
      </div>

      <div className="border-t pt-3 flex-1 min-h-0">
        {loading ? (
          <p className="text-sm text-gray-500">Loading info...</p>
        ) : article ? (
          <div className="model-panel-content">
            {article.content && (
              <div className="text-sm">
                <ContentRenderer content={article.content} />
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            No information available.
            {model.typeCode && ` (Looking for slug: ${model.typeCode.toLowerCase()})`}
          </p>
        )}
      </div>
      <style>{`
        .model-panel-scroll::-webkit-scrollbar {
          width: 8px;
        }
        .model-panel-scroll::-webkit-scrollbar-track {
          background: #f1f1f1;
          border-radius: 4px;
        }
        .model-panel-scroll::-webkit-scrollbar-thumb {
          background: #888;
          border-radius: 4px;
        }
        .model-panel-scroll::-webkit-scrollbar-thumb:hover {
          background: #555;
        }
        .model-panel-content img {
          max-width: 100% !important;
          max-height: none !important;
          height: auto !important;
          border-radius: 4px;
          margin-top: 8px;
          margin-bottom: 8px;
          display: block;
        }
        .model-panel-content span {
          max-height: none !important;
        }
        .model-panel-content .prose img {
          max-width: 100%;
          height: auto;
        }
      `}</style>
    </div>
  );
}

export function FlightMap({
  center = [37.7749, -122.4194],
  zoom = 10,
  className = "h-96 w-full"
}: FlightMapProps) {
  const [isClient, setIsClient] = useState(false);
  const [viewMode, setViewMode] = useState<"airplanes" | "ships" | "space">("airplanes");
  const [selectedFlight, setSelectedFlight] = useState<SelectedFlight | null>(null);
  const [selectedModel, setSelectedModel] = useState<SelectedModel | null>(null);

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

    // Suppress AbortError from cancelled requests and tRPC query logs
    const originalError = console.error;
    console.error = (...args: unknown[]) => {
      const message = String(args[0] ?? '');
      if (
        message.includes('AbortError') ||
        message.includes('aborted a request') ||
        message.includes('[[ <<') ||
        message.includes('>> ]]') ||
        message.includes('query #')
      ) {
        return;
      }
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
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
      zoomControl={false}
      className={className}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
        url="https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      />
      <ZoomControl position="topleft" />
      <ViewModeControl viewMode={viewMode} onViewModeChange={setViewMode} />
      <LocationControl />
      <ZoomNotice viewMode={viewMode} />
      <MapBoundsTracker
        viewMode={viewMode}
        onFlightSelect={(flight) => {
          setSelectedFlight(flight);
          setSelectedModel(null); // Close model panel when selecting flight
        }}
        onModelSelect={(modelName, typeCode) => {
          setSelectedModel({ modelName, typeCode });
          setSelectedFlight(null); // Close airlines panel when selecting model
        }}
      />
      {selectedFlight && !selectedModel && (
        <AirlinesPanel
          flight={selectedFlight}
          onClose={() => setSelectedFlight(null)}
        />
      )}
      {selectedModel && (
        <ModelPanel
          model={selectedModel}
          onClose={() => setSelectedModel(null)}
        />
      )}
    </MapContainer>
  );
}
