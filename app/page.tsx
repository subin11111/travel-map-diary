import NaverMap from "../components/NaverMap";
import { TravelMapProvider } from "@/components/TravelMapProvider";

export default function Home() {
  return (
    <main className="min-h-screen">
      <TravelMapProvider>
        <NaverMap />
      </TravelMapProvider>
    </main>
  );
}
