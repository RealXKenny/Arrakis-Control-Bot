import items from "../../../../data/admin-items.json";
import skills from "../../../../data/admin-skill-modules.json";
import vehicles from "../../../../data/admin-vehicles.json";
import journeys from "../../../../data/journey-tags.json";
import compatibility from "../../../../data/augment-compatibility.json";
import xp from "../../../../data/admin-xp-event-tags.json";
import regions from "../../../../data/hagga-regions.json";
import market from "../../../../data/market-seed-plan.json";

export const CATALOG_NAMES = ["items", "skills", "vehicles", "journeys", "augments", "xp-events", "regions", "market"] as const;
export type CatalogName = typeof CATALOG_NAMES[number];
interface Entry { name: string; value: string; detail?: string }
const itemIndex = new Map(items.map((item) => [item.id, item]));
const marketIndex = new Map(market.rows.map((item) => [item.template_id, item]));
const augmentIndex = compatibility.augments as Record<string, { name: string; tags: string[]; effectSummary?: string }>;
const itemTags = compatibility.itemAliases as Record<string, string[]>;
const namedTags = compatibility.methodItems as Record<string, string[]>;
const entries: Record<CatalogName, Entry[]> = {
  items: items.map((item) => ({ name: item.name, value: item.id, detail: item.category })),
  skills: skills.map((skill) => ({ name: skill.name, value: skill.id, detail: `${skill.category}; max level ${skill.maxLevel}` })),
  vehicles: vehicles.map((vehicle) => ({ name: vehicle.id, value: vehicle.id, detail: vehicle.templates.join(", ") })),
  journeys: Object.keys(journeys.journey_node_tags).map((id) => ({ name: id, value: id, detail: (journeys.journey_aliases as Record<string, string>)[id.split(".")[0]] })),
  augments: Object.entries(augmentIndex).map(([id, augment]) => ({ name: augment.name, value: id, detail: augment.effectSummary })),
  "xp-events": xp.map((event) => ({ name: event.constant, value: event.id, detail: event.family })),
  regions: Object.entries(regions.HaggaBasin).map(([id, name]) => ({ name, value: id, detail: "Hagga Basin area ID" })),
  market: market.rows.map((row) => ({ name: row.display_name, value: row.template_id, detail: `Seed reference price: ${row.price}; not a live listing` })),
};

export function searchCatalog(kind: CatalogName, query: string, limit = 25): Entry[] {
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return entries[kind].filter((entry) => terms.every((term) => `${entry.name} ${entry.value} ${entry.detail ?? ""}`.toLowerCase().includes(term))).slice(0, limit);
}
export function catalogItemName(id: string): string | undefined { return itemIndex.get(id)?.name ?? marketIndex.get(id)?.display_name; }
export function haggaRegion(map: unknown, areaId: unknown): string | undefined {
  return map === "HaggaBasin" && (typeof areaId === "number" || typeof areaId === "string") ? (regions.HaggaBasin as Record<string, string>)[String(areaId)] : undefined;
}

export function adminCatalogOptions(action: string, option: string, query: string, vehicleId?: string | null) {
  let choices: Entry[] = [];
  if (option === "item-name") choices = searchCatalog("items", query, 200).map((item) => ({ ...item, value: item.name }));
  else if (option === "item-id" && action === "give-item-id") choices = searchCatalog("items", query, 200);
  else if (option === "module") choices = searchCatalog("skills", query, 100);
  else if (option === "vehicle-id") choices = searchCatalog("vehicles", query);
  else if (option === "template") choices = (vehicles.find((vehicle) => vehicle.id === vehicleId)?.templates ?? []).filter((template) => template.toLowerCase().includes(query.toLowerCase())).map((template) => ({ name: template, value: template }));
  else if (option === "node-id") choices = searchCatalog("journeys", query, 200);
  return [...new Map(choices.filter((entry) => entry.value.length <= 100).map((entry) => [entry.value, { name: `${entry.name} — ${entry.value}`.slice(0, 100), value: entry.value }])).values()].slice(0, 25);
}

export function validateCatalogGrant(action: string, body: Record<string, unknown>): void {
  // Dev note: Known catalog mistakes stop here; unknown future spice still flows upstream.
  if (action === "give-items" && Array.isArray(body.items)) {
    for (const item of body.items) {
      if (item && typeof item === "object" && !Array.isArray(item)) validateCatalogGrant("give-item-id", item as Record<string, unknown>);
    }
  }
  if (action === "set-skill-module") {
    const skill = skills.find((skill) => skill.id === body.module);
    if (skill && typeof body.level === "number" && body.level > skill.maxLevel) throw new Error(`This skill module supports levels 0–${skill.maxLevel}.`);
  }
  if (action === "spawn-vehicle") {
    const vehicle = vehicles.find((vehicle) => vehicle.id === body.vehicleId);
    if (vehicle && typeof body.template === "string" && !vehicle.templates.includes(body.template)) throw new Error(`Choose a template for ${vehicle.id}: ${vehicle.templates.join(", ")}.`);
  }
  if (!["give-item", "give-item-id"].includes(action) || !Array.isArray(body.augments)) return;
  const id = typeof body.itemId === "string" ? body.itemId : undefined;
  const name = typeof body.itemName === "string" ? body.itemName : id ? catalogItemName(id) : undefined;
  const tags = (id ? itemTags[id] : undefined) ?? (name ? namedTags[name] : undefined);
  if (!tags?.length) return;
  for (const value of body.augments) {
    const augment = typeof value === "string" ? augmentIndex[value] : undefined;
    if (augment?.tags.length && !augment.tags.some((tag) => tags.some((itemTag) => itemTag.startsWith(tag)))) throw new Error(`${augment.name} is not compatible with this item in the bundled catalog.`);
  }
}
