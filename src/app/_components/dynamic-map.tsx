"use client";

import dynamic from "next/dynamic";
import type { ComponentProps } from "react";

// Dynamically import the Map component with SSR disabled
// This is necessary because Leaflet uses the window object
const Map = dynamic(() => import("./map").then((mod) => mod.Map), {
  ssr: false,
  loading: () => (
    <div className="flex h-96 w-full items-center justify-center bg-gray-100">
      <p className="text-gray-500">Loading map...</p>
    </div>
  ),
});

type MapProps = ComponentProps<typeof Map>;

export function DynamicMap(props: MapProps) {
  return <Map {...props} />;
}
