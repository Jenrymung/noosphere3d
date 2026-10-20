import { createEmptyMap } from "../core/document";
import { starterLinkTypes } from "../core/starter";
import type { MapDocument } from "../core/types";

const WORDS = [
  "rain", "drain", "flood", "levee", "culvert", "basin", "tide", "pump",
  "street", "roof", "inlet", "outfall", "marsh", "gauge", "storm", "sewer",
  "creek", "soil", "runoff", "policy", "wall", "gate", "pond", "channel",
];

const CLUSTER_COLORS = ["#9bb6d4", "#d4c49b", "#b7d4b0", "#d4a8bc", "#c4b6d4", "#d4c2b0"];

/** 6 clusters × 8 × 8 × 6. */
export const STRESS_NODE_COUNT = 2304;

/**
 * A deterministic web big enough to judge labels and arrow-key navigation.
 * Grid neighbours are linked so spatial moves have an obvious next node.
 */
export function stressMap(): MapDocument {
  const doc = createEmptyMap({
    id: "stress-web",
    title: "Stress web",
    now: "2026-10-20T00:00:00.000Z",
  });
  const typeIds = Object.keys(starterLinkTypes());
  const clusters = 6;
  const nx = 8;
  const ny = 8;
  const nz = 6;
  let n = 0;
  let linkCount = 0;
  const addLink = (source: string, target: string, typeId: string) => {
    doc.links[`k${linkCount}`] = { source, target, typeId, text: "" };
    linkCount += 1;
  };

  for (let c = 0; c < clusters; c += 1) {
    const angle = (c / clusters) * Math.PI * 2;
    const cx = Math.cos(angle) * 32;
    const cz = Math.sin(angle) * 32;
    const cy = (c % 2 === 0 ? 1 : -1) * 8;
    const at = (x: number, y: number, z: number) => `s${c}-${x}-${y}-${z}`;
    for (let z = 0; z < nz; z += 1) {
      for (let y = 0; y < ny; y += 1) {
        for (let x = 0; x < nx; x += 1) {
          const title = `${WORDS[n % WORDS.length]} ${n}`;
          doc.nodes[at(x, y, z)] = {
            text: `# ${title}\nCluster ${c + 1}, a short note so the derived title is the heading.`,
            position: {
              x: cx + (x - (nx - 1) / 2) * 1.85,
              y: cy + (y - (ny - 1) / 2) * 1.85,
              z: cz + (z - (nz - 1) / 2) * 1.85,
            },
            style: { color: CLUSTER_COLORS[c], size: 0.8 },
          };
          n += 1;
        }
      }
    }
    for (let z = 0; z < nz; z += 1) {
      for (let y = 0; y < ny; y += 1) {
        for (let x = 0; x < nx; x += 1) {
          const id = at(x, y, z);
          if (x + 1 < nx) addLink(id, at(x + 1, y, z), typeIds[(x + y + c) % typeIds.length]);
          if (y + 1 < ny) addLink(id, at(x, y + 1, z), typeIds[(y + z + 3) % typeIds.length]);
          if (z + 1 < nz) addLink(id, at(x, y, z + 1), typeIds[(z + c) % typeIds.length]);
        }
      }
    }
    addLink(at(0, 0, 0), at(0, 0, 0), "relates-to");
    if (c > 0) addLink(at(0, 0, 0), `s${c - 1}-7-7-5`, "causes");
    if (c === 0) {
      addLink(at(1, 1, 1), at(2, 1, 1), "supports");
    }
  }
  return doc;
}
