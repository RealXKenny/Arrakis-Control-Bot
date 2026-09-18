# Bundled game reference catalogs

These eight JSON files were supplied by the server owner on 2026-09-17 and are bundled in the build. Their source metadata and contents are preserved. Replace the files and rebuild to refresh them.

- `admin-items.json`: item names and IDs for grant autocomplete and market-name fallback.
- `admin-skill-modules.json`: skill autocomplete and known maximum levels.
- `admin-vehicles.json`: vehicle choices, dependent templates and pair validation.
- `journey-tags.json`: journey-node autocomplete and aliases.
- `augment-compatibility.json`: prefix-based tag compatibility checks for known grant items and string augment IDs.
- `admin-xp-event-tags.json`: XP-event reference lookup; not an XP amount or an automatic reward.
- `hagga-regions.json`: map-specific area labels when a player API response contains a map and area ID.
- `market-seed-plan.json`: reference lookup and fallback display names; never used to seed listings or replace live prices.

Use `/player catalog catalog:<name> query:<text>` to search any dataset. Admin command suggestions return at most 25 choices. Identifiers longer than Discord's 100-character autocomplete limit can still be entered manually. Unknown identifiers are left for the live Console to validate, so newer game content is not blocked solely because it is absent here. Known incompatibilities are rejected; augment objects and inventory-instance IDs are not guessed from item templates.
