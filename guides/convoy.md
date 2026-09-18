# Convoy VPS integration

The bot's `/servers` command uses `GET /api/v1/client/servers`, following the supplied Convoy OpenAPI 3.1 reference (`api-1.yaml`, API version 1.0.0).

Set `API_URL` to your Convoy panel origin (for example, `https://vps.advinservers.com`) and `API_KEY` to a bearer API key. A URL ending in `/api/v1/client` also works. Existing origin-only settings need no change. Restart after changing configuration.

Create the key for the team whose servers you want to display and grant **`server.read`**. If the key uses IP groups, allow the bot host's outbound IP. The bot does not send a team override; team selection follows the key. The reference's general team-scope description and generated header parameter descriptions disagree, so no cross-team behavior is assumed.

The endpoint returns the full server list as a JSON array without pagination. The bot displays up to 25 entries, including power state, primary IP from `limits.addresses`, and location. Discord's message size limit may shorten long lists. No billing, power, or other mutation endpoints are called.

- **401:** Check whether the key is valid or revoked.
- **403:** Check `server.read`, team access and IP restrictions.
- **404:** Check the API URL and resource visibility in the key's team.
- **429:** Wait for the displayed `Retry-After` duration. Limits are shared across the account; the bot does not automatically replay requests.

Requests time out after 30 seconds. Redirects are rejected, and credentials cannot be sent to another origin through a supplied route. Empty teams are shown as empty; malformed server responses are reported as failures.
