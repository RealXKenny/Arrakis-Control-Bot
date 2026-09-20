import { ContainerBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder, MessageFlags, type Client, type MessageCreateOptions, type MessageEditOptions } from "discord.js";

import { createDuneBanner } from "../../../shared/discord/imageFactory";
import { createV2Response } from "../../../shared/discord/componentFactory";
import { findPanelMessage } from "../../../shared/discord/findPanelMessage";

const PANEL_MARKER = "# 🩸 CRIMSON SKIES";
const PANEL_CONTINUATION_MARKER = "-# CRIMSON SKIES SERVER INFO PART 2";
const PANEL_IMAGE_NAME = "crimson-skies-info.png";

async function ensureServerInfoPanel(client: Client, channelId?: string | null): Promise<void> {
  if (!channelId) {
    return;
  }

  if (!client.user) {
    throw new Error("Cannot create server info panel before the Discord client is ready.");
  }

  const channel = await client.channels.fetch(channelId);

  if (!channel || !channel.isSendable()) {
    throw new Error(`Server info panel channel ${channelId} is not a sendable channel.`);
  }

  const containers: ContainerBuilder[] = [
    new ContainerBuilder()
      .setAccentColor(0xc58b45)
      .addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${PANEL_IMAGE_NAME}`).setDescription("Crimson Skies server information banner")))
      .addTextDisplayComponents((text) => text.setContent(PANEL_MARKER))
      .addTextDisplayComponents((text) =>
        text.setContent(
          "## SERVER INFORMATION\n\nWelcome to **Crimson Skies — Dune: Awakening Community Server**.\n\n⚠️ Make these changes while **Dune: Awakening is completely closed**. Add each configuration to the **bottom** of the matching file, then save before launching the game.",
        ),
      ),

    new ContainerBuilder()
      .setAccentColor(0xc58b45)
      .addTextDisplayComponents((text) => text.setContent("### ⚙️ CONFIGURATION 01 • GAME SETTINGS"))
      .addTextDisplayComponents((text) => text.setContent("**Path:** `%LOCALAPPDATA%\\DuneSandbox\\Saved\\Config\\Windows\\Game.ini`\n\nPress **Windows Key + R**, paste the path, open `Game.ini`, and add:"))
      .addTextDisplayComponents((text) =>
        text.setContent(
          '```ini\n[/Script/DuneSandbox.BuildingSettings]\nm_BaseBackupToolMapRestriction=((Name="HaggaBasin"), (Name="Editor_Default"), (Name="IGW_Test_Small"), (Name="DeepDesert"))\nm_BaseBackupToolTimeRestrictionInSeconds=60\nm_bEnableBuildingNearServerBorders=True\nm_StakingUnitVerticalExtensionDefaultTimes=0.100000\nm_StakingUnitExtensionDefaultTimes=0.100000\nm_bBuildingRestrictionLimitsEnabled=False\nm_BuildingBlueprintMaxExtensions=16\nm_BaseBackupMaxExtensions=20\nm_TimeToAutomaticallyCloseDoor=20\nm_DefaultRepairCostMultiplier=0.125\n\n[/Script/DuneSandbox.CoriolisSubsystem]\nm_CycleStartHour=10\nm_CycleStartDay=3\n\n[/Script/DuneSandbox.DuneGameMode]\nm_ItemDurabilityLossMultiplier=0.5\nSellOrderPricePercentageFee=1.0\nm_WaterConsumptionRate=0.5\nm_WaterConsumptionInStormMultiplier=2.0\nm_InventoryWeightMultiplier=0.5\n\n[/Script/DuneSandbox.DuneSandboxGameModeBase]\nm_bShouldPlayersDropLootOnDefeat=False\nm_bShouldPlayersLoseItemsOnDeath=False\n\n[/Script/DuneSandbox.FlourSandSubsystem]\nm_FlourSandFieldsActivePercentage=3\n\n[/Script/DuneSandbox.GuildSettings]\nm_MaxGuildsAllowed=6\n\n[/Script/DuneSandbox.InventorySystemSettings]\nPlayerInventoryStartingSize=80\nPlayerInventoryStartingVolumeCapacity=450\n```',
        ),
      ),

    new ContainerBuilder()
      .setAccentColor(0xc58b45)
      .addTextDisplayComponents((text) => text.setContent(PANEL_CONTINUATION_MARKER))
      .addTextDisplayComponents((text) => text.setContent("### ⚙️ CONFIGURATION 01 • GAME SETTINGS CONTINUED"))
      .addTextDisplayComponents((text) =>
        text.setContent(
          '```ini\n[/Script/DuneSandbox.LandsraadSettings]\nData=(m_NumberOfWeeksTermRetention=4,m_NumberOfDecreesToNominate=3,m_NumberOfGuildsInHighscoreList=5,m_TermStartedMessage=(Name="LandsraadTermStarted"),m_VotingStartedMessage=(Name="LandsraadVotingStarted"),m_TaskProgressedMessage=(Name="LandsraadProgressNotification"),m_DecreeActivatedMessage=(Name="LandsraadDecreeActivated"),m_bIsPlayerVotingEnabled=True,m_bIsTerritoryControlEnabled=True,m_BoardLayouts=(/Script/DuneSandbox.BoardLayoutDataAsset\'"/Game/Dune/Systems/Landsraad/BoardLayouts/DefaultLandsraadBoardLayout.DefaultLandsraadBoardLayout"\'),m_LandsraadVotingPeriodDurationInSec=118500,m_VotingPeriodStartBeforeCoriolisCycleInSec=118800,m_LandsraadCycleDurationInSeconds=604800,m_LandsraadSuspendedPeriodDurationInSeconds=300,m_FirstTaskRevealDelayFromCompetitionStartInSeconds=0.000000,m_LandsraadRevealedTaskTimestampMinuteDifference=1,m_LandsraadTaskProgressUpdateFrequency=15.000000,m_LandsraadTaskDailyRevealFrequency=25.000000,m_LandsraadProgressFactionBalanceCurve=/Script/Engine.CurveFloat\'"/Game/Dune/Systems/Landsraad/Curve_LandsraadProgressFactionBalanceCurve.Curve_LandsraadProgressFactionBalanceCurve"\',m_LandsraadContractsPerVotingBlock=3,m_LandsraadContractsRepeatCooldownSeconds=900,m_LandsraadContractsMaxActiveAmount=3,m_LandsraadContractsAbandonCooldownSeconds=2,m_LandsraadContractsDailyBonusPerDay=70,m_LandsraadContractsDailyBonusMax=70,m_LandsraadContractsDailyBonusReferenceTimestamp=1760572800,m_LandsraadContractsDailyBonusRefreshCycleLength=900,m_LandsraadContractsTimeToShowRewardInteractiveNotification=30.000000,m_LandsraadContractsTimeToShowErrorNotification=70.000000,m_LandsraadContractsTimeToShowPendingClaimRewardTutorial=300,m_LandsraadTaskRewardsData="/Game/Dune/Systems/Landsraad/DA_TaskRewardsDataAsset.DA_TaskRewardsDataAsset",m_LandsraadHouseSelectContractDialogContentWidget="/Game/Dune/GUI/Widgets/Menus/Gameplay/PlayerMenu/Landsraad/W_LandsraadHouseSelectContractDialog.W_LandsraadHouseSelectContractDialog_C",m_LandsraadContractReportDialogContentWidget="/Game/Dune/GUI/Widgets/Menus/Gameplay/PlayerMenu/Landsraad/W_LandsraadContractReportDialog.W_LandsraadContractReportDialog_C",m_LandsraadClaimHouseRewardDialogWidget="/Game/Dune/GUI/Widgets/Menus/Gameplay/PlayerMenu/Landsraad/W_LandsraadHouseRewardClaimDialog.W_LandsraadHouseRewardClaimDialog_C",m_TaskGoalAmount=56000,m_ControlPointsPerCycle=2,m_LandsraadContractsUnlockGameplayTag=(TagName="Journey.LandsraadContractsUnlocked"),m_LandsraadContractsNewMarkerGameplayTags=(GameplayTags=((TagName="DialogueFlags.Factions.LandsraadOnboardingActive"))),m_ControlPointAreaMaterial="/Game/Dune/Systems/Landsraad/Materials/M_LandsRaadControlPointCapsule.M_LandsRaadControlPointCapsule")\n\n[/Script/DuneSandbox.RespawnSettings]\nm_bCrossMapRespawnDropItems=False\n```',
        ),
      ),

    new ContainerBuilder()
      .setAccentColor(0xc58b45)
      .addTextDisplayComponents((text) => text.setContent("### 🏜️ CONFIGURATION 02 • ENGINE SETTINGS"))
      .addTextDisplayComponents((text) => text.setContent("**Path:** `%LOCALAPPDATA%\\DuneSandbox\\Saved\\Config\\Windows\\Engine.ini`\n\nOpen `Engine.ini` and add:"))
      .addTextDisplayComponents((text) => text.setContent("```ini\n[ConsoleVariables]\nVehicle.MaxVehiclesPerPlayer=50\n```")),

    new ContainerBuilder()
      .setAccentColor(0xc58b45)
      .addTextDisplayComponents((text) =>
        text.setContent(
          "### ✅ FINAL CHECK\n\n☑️ The game was closed while editing.\n☑️ Both files contain the correct configuration.\n☑️ Settings were added to the bottom of each file.\n☑️ Both files were saved before launching.\n\n🏜️ **Crimson Skies** • PvE • Guilds & Alliances • Trading & Economy • Guides & Builds\n\n*Walk without rhythm.*",
        ),
      ),
  ];

  const banner = createDuneBanner({
    filename: PANEL_IMAGE_NAME,
    title: "Crimson Skies",
    subtitle: "SERVER INFORMATION",
    detail: "DUNE: AWAKENING COMMUNITY",
  });

  const bannerName = banner.name ?? PANEL_IMAGE_NAME;

  // Dev note: Two panels share the load because Discord also fears a wall of text.
  const primaryResponse = createV2Response(containers.slice(0, 2), [
    {
      attachment: banner.attachment,
      name: bannerName,
      description: banner.description ?? undefined,
    },
  ]);
  const continuationResponse = createV2Response(containers.slice(2));

  const primaryPayload: MessageCreateOptions = {
    components: primaryResponse.components,
    files: primaryResponse.files,
    flags: MessageFlags.IsComponentsV2,
  };
  const continuationPayload: MessageCreateOptions = {
    components: continuationResponse.components,
    flags: MessageFlags.IsComponentsV2,
  };

  const [existingPrimary, existingContinuation] = await Promise.all([findPanelMessage(channel, client.user.id, PANEL_MARKER), findPanelMessage(channel, client.user.id, PANEL_CONTINUATION_MARKER)]);

  const editPanel = async (message: NonNullable<typeof existingPrimary>, response: typeof primaryResponse): Promise<void> => {
    const editPayload: MessageEditOptions = {
      content: null,
      embeds: [],
      components: response.components,
      files: response.files,
    };

    await message.edit(editPayload);
  };

  if (existingPrimary) {
    await editPanel(existingPrimary, primaryResponse);

    if (existingContinuation) {
      await editPanel(existingContinuation, continuationResponse);
    } else {
      await channel.send(continuationPayload);
    }

    return;
  }

  if (existingContinuation) {
    await editPanel(existingContinuation, primaryResponse);
    await channel.send(continuationPayload);
    return;
  }

  await channel.send(primaryPayload);
  await channel.send(continuationPayload);
}

export { ensureServerInfoPanel };
