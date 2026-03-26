import { DynamicFlightMap } from "~/app/_components/dynamic-flight-map";
import Link from "next/link";

export default function Home() {
  return (
    <main className="relative h-screen w-full">
      <Link
        href="/articles"
        className="absolute left-4 top-4 z-[1000] rounded-lg bg-white px-4 py-2 font-semibold shadow-lg transition hover:bg-gray-100"
      >
        View Airlines
      </Link>
      <DynamicFlightMap
        center={[37.7749, -122.4194]}
        zoom={10}
        className="h-full w-full"
      />
    </main>
  );
}
