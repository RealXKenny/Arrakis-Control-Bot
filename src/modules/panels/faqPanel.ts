import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, SeparatorSpacingSize, type Client, type MessageCreateOptions, type MessageEditOptions } from "discord.js";
import { createDuneBanner } from "../../shared/factories/imageFactory";
import { findPanelMessage } from "../../shared/utils/findPanelMessage";

const PANEL_MARKER = "# ❓・CRIMSON SKIES FAQ";
const PANEL_IMAGE_NAME = "crimson-skies-faq.png";
const ACCENT_COLOR = 0xc58b45;

function section(title: string, body: string): ContainerBuilder {
  return new ContainerBuilder()
    .setAccentColor(ACCENT_COLOR)
    .addTextDisplayComponents((text) => text.setContent(`### ${title}`))
    .addTextDisplayComponents((text) => text.setContent(body));
}

function buildFaqPanel(): ContainerBuilder[] {
  return [
    new ContainerBuilder()
      .setAccentColor(ACCENT_COLOR)
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${PANEL_IMAGE_NAME}`).setDescription("Crimson Skies frequently asked questions banner")))
      .addTextDisplayComponents((text) => text.setContent(PANEL_MARKER))
      .addTextDisplayComponents((text) => text.setContent("Welcome to **Crimson Skies — Dune: Awakening Community Server!** 🏜️\n\nWe are a **North American, self-hosted PvE Dune: Awakening server** focused on community, exploration, progression, building, crafting, trading, and surviving Arrakis together.\n\n🌎 **Region:** North America\n⚔️ **Playstyle:** PvE\n🖥️ **Server:** Self-Hosted\n🎮 **Game:** Dune: Awakening")),

    section("🚪 HOW DO I GET STARTED?", "New to Crimson Skies? Start here:\n\n1️⃣ Visit <#1539717471852953610>\n2️⃣ Read <#1538602111951175791>\n3️⃣ Pick your roles in <#1539717619584864398>\n4️⃣ Check <#1539717593164947548> for server information\n5️⃣ Use <#1540105536526356611> to link your account\n\nOnce you're set up, you're ready to explore Arrakis!"),

    section("🛡️ IS CRIMSON SKIES PVP OR PVE?", "Crimson Skies is a **PvE-focused server**.\n\nOur focus is cooperative gameplay, exploration, progression, resource gathering, crafting, building, trading, and community activities.\n\nPlease read <#1538602111951175791> for server rules and player conduct."),

    section("📚 WHERE CAN I FIND GAME HELP?", "Start with <#1539747775145582733>.\n\n**THE ARCHIVES** also includes:\n💡 <#1539747801661964288> — Game Tips\n🛠️ <#1539747859799212083> — Builds\n🔨 <#1539747930846662768> — Crafting\n⛏️ <#1539747975314542623> — Resources\n🌪️ <#1547655623561187518> — Coriolis Storms\n\nNeed more help? Ask in <#1532230917786177599>."),

    section("👥 LOOKING FOR A GROUP?", "Use <#1539718860297601125> to find players for **PvE, Deep Desert, exploration, resource runs, progression, or general gameplay**.\n\nWe also have dedicated **LFG and PvE voice channels**."),

    section("💰 CAN I TRADE WITH OTHER PLAYERS?", "Yes! Our **SPICE MARKET** includes:\n\n💰 <#1539718497398161479> — Trading\n🏪 <#1539718535389904967> — Marketplace\n🔄 <#1539718563017785384> — Buy & Sell\n📦 <#1539718599759896666> — Resource Trading\n📊 <#1539748711486324756> — Trade Rates\n\nClearly state what you're **buying, selling, or trading**."),

    section("🏰 ARE GUILDS ALLOWED?", "Absolutely!\n\nUse <#1539718924990681088> to recruit members or find a guild.\n\n**LANDSRAAD** also includes:\n🏛️ <#1539719190133477427> — Faction Talk\n⚖️ <#1539719223608348753> — Guild Politics\n🗺️ <#1539749090211008622> — Territory\n🤝 <#1539719270517317783> — Alliances\n\nKeep guild interactions, diplomacy, and disagreements respectful."),

    section("🎉 ARE THERE COMMUNITY EVENTS?", "Yes! Watch <#1539748867833200640> and <#1539717568678469723> for upcoming events and important announcements."),

    section("🎙️ DO YOU HAVE VOICE CHANNELS?", "Yes! We have voice channels for **Sietch Voice, Deep Desert, PvE, LFG, and AFK**. Feel free to jump in!"),

    section("💡 HAVE A SUGGESTION?", "Post ideas and constructive feedback in <#1539758595363840091>."),

    section("🆘 NEED STAFF HELP?", "For server issues, player reports, account problems, or anything requiring staff assistance, open a ticket through <#1547327929086775376>.\n\nPlease avoid public arguments or callouts. Include relevant information or evidence in your ticket."),

    new ContainerBuilder()
      .setAccentColor(ACCENT_COLOR)
      .addTextDisplayComponents((text) => text.setContent("## 🌵 WELCOME TO CRIMSON SKIES"))
      .addTextDisplayComponents((text) => text.setContent("**Explore • Build • Trade • Survive**\n\nHelp your fellow travelers, respect the community, and enjoy your time on Arrakis.\n\n**The desert is unforgiving — your fellow players don't have to be.** 🏜️"))
      .addSeparatorComponents((separator) => separator.setSpacing(SeparatorSpacingSize.Small))
      .addTextDisplayComponents((text) => text.setContent("-# Crimson Skies • Dune: Awakening Community Server")),
  ];
}

async function ensureFaqPanel(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId) return;
  if (!client.user) throw new Error("Cannot create FAQ panel before the Discord client is ready.");
  const channel = await client.channels.fetch(channelId);
  if (!channel?.isSendable()) throw new Error(`FAQ panel channel ${channelId} is not a sendable channel.`);

  const banner = createDuneBanner({ filename: PANEL_IMAGE_NAME, title: "Crimson Skies", subtitle: "COMMUNITY FAQ", detail: "EXPLORE • BUILD • TRADE • SURVIVE" });
  const components = buildFaqPanel();
  const files = [{ attachment: banner.attachment, name: PANEL_IMAGE_NAME, description: banner.description ?? undefined }];
  const existing = await findPanelMessage(channel, client.user.id, PANEL_MARKER);
  if (existing) {
    const payload: MessageEditOptions = { content: null, embeds: [], components, files };
    await existing.edit(payload);
    return;
  }
  const payload: MessageCreateOptions = { components, files, flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
  await channel.send(payload);
}

export { buildFaqPanel, ensureFaqPanel };
