import { DynamicFlightMap } from "~/app/_components/dynamic-flight-map";

export default function Home() {
  return (
    <main className="h-screen w-full">
      <DynamicFlightMap
        center={[37.7749, -122.4194]}
        zoom={10}
        className="h-full w-full"
      />
    </main>
  );
}
