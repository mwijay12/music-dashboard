import type { Arc, Marker } from "cobe";
import type { GlobeLabel } from "@/components/ui/cobe-globe";

export interface GlobeCity {
  id: string;
  name: string;
  location: [number, number];
  listeners: number;
  size: number;
  label: boolean;
}

export const GLOBE_CITIES: GlobeCity[] = [
  { id: "london", name: "London", location: [51.5074, -0.1278], listeners: 82400, size: 0.085, label: true },
  { id: "berlin", name: "Berlin", location: [52.52, 13.405], listeners: 61200, size: 0.07, label: false },
  { id: "tokyo", name: "Tokyo", location: [35.6762, 139.6503], listeners: 54900, size: 0.067, label: true },
  {
    id: "los-angeles",
    name: "Los Angeles",
    location: [34.0522, -118.2437],
    listeners: 49100,
    size: 0.06,
    label: true,
  },
  {
    id: "sao-paulo",
    name: "São Paulo",
    location: [-23.5505, -46.6333],
    listeners: 38800,
    size: 0.052,
    label: false,
  },
];

const london = GLOBE_CITIES[0].location;

export const GLOBE_MARKERS: Marker[] = GLOBE_CITIES.map((city) => ({
  id: city.id,
  location: city.location,
  size: city.size,
}));

export const GLOBE_ARCS: Arc[] = GLOBE_CITIES.slice(1).map((city) => ({
  id: `london-${city.id}`,
  from: london,
  to: city.location,
}));

export const GLOBE_LABELS: GlobeLabel[] = GLOBE_CITIES.filter((city) => city.label).map((city) => ({
  id: city.id,
  name: city.name,
  value: `${(city.listeners / 1000).toFixed(1)}K`,
}));
