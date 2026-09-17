// Presentation only: AMQP bindings and publish routing keep their exact keys.
const MAP_LABELS = new Map<string, string>([
  ["HaggaBasin.0", "Hagga Basin"],
  ["Survival_1.dim_1", "Hagga Basin PvP"],
  ["DeepDesert_1.0", "Deep Desert PvP"],
  ["DeepDesert_1.dim_1", "Deep Desert PvE"],
  ["SH_Arrakeen.0", "Arrakeen"],
  ["SH_HarkoVillage.0", "Harko Village"],
  ["Survival_1.dim_0", "World Overmap"],
]);

export function mapChatLabel(routingKey: string): string {
  return MAP_LABELS.get(routingKey) ?? routingKey;
}
