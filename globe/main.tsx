import { createRoot } from "react-dom/client";
import { Globe } from "@/components/ui/cobe-globe";
import { GLOBE_ARCS, GLOBE_LABELS, GLOBE_MARKERS } from "./globe-data";
import "@/styles/tailwind.css";
import "./globe.css";

const mount = document.getElementById("cobeGlobe");

if (mount) {
  mount.replaceChildren();
  createRoot(mount).render(
    <Globe markers={GLOBE_MARKERS} arcs={GLOBE_ARCS} labels={GLOBE_LABELS} />
  );
}
