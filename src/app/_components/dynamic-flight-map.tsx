"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

// Dynamically import the FlightMap component with SSR disabled
// This is necessary because Leaflet uses the window object
const FlightMap = dynamic(() => import("./flight-map").then((mod) => mod.FlightMap), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 w-full items-center justify-center bg-gray-100">
      <p className="text-gray-500">Loading flight map...</p>
    </div>
  ),
});

type FlightMapProps = ComponentProps<typeof FlightMap>;

export function DynamicFlightMap(props: FlightMapProps) {
  return <FlightMap {...props} />;
}
