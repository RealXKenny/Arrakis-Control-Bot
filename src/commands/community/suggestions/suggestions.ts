import { Command } from "@sapphire/framework";
import { ChannelType, InteractionContextType, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { autocompleteSuggestionFeature, executeSuggestionsCommand } from "../../../modules/community/suggestions/suggestionInteractions";
import { STATUS_DEFINITIONS, SUGGESTION_STATUSES } from "../../../modules/community/suggestions/suggestionTags";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const DESCRIPTION = "Suggestion forum assistant: summaries, similar posts, statuses and features.";

const data = new SlashCommandBuilder()
  .setName("suggestions")
  .setDescription(DESCRIPTION)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((command) => command
    .setName("similar")
    .setDescription("Find suggestions that read like this post.")
    .addChannelOption((option) => option.setName("post").setDescription("Suggestion post; defaults to the current one.").addChannelTypes(ChannelType.PublicThread)))
  .addSubcommand((command) => command
    .setName("summary")
    .setDescription("Summarize the discussion in a suggestion post.")
    .addChannelOption((option) => option.setName("post").setDescription("Suggestion post; defaults to the current one.").addChannelTypes(ChannelType.PublicThread))
    .addBooleanOption((option) => option.setName("public").setDescription("Staff only: post the summary in the thread for everyone.")))
  .addSubcommand((command) => command
    .setName("status")
    .setDescription("Staff: set a suggestion's status and notify the suggester.")
    .addStringOption((option) => option.setName("status").setDescription("New status.").setRequired(true)
      .addChoices(...SUGGESTION_STATUSES.map((status) => ({ name: STATUS_DEFINITIONS[status].label, value: status }))))
    .addChannelOption((option) => option.setName("post").setDescription("Suggestion post; defaults to the current one.").addChannelTypes(ChannelType.PublicThread))
    .addStringOption((option) => option.setName("note").setDescription("Optional note shown with the update.").setMaxLength(300)))
  .addSubcommand((command) => command
    .setName("panel")
    .setDescription("Staff: post or refresh the assistant panel in a suggestion post.")
    .addChannelOption((option) => option.setName("post").setDescription("Suggestion post; defaults to the current one.").addChannelTypes(ChannelType.PublicThread)))
  .addSubcommandGroup((group) => group
    .setName("feature")
    .setDescription("Staff: connect the work you do to the suggestions it answers.")
    .addSubcommand((command) => command
      .setName("start")
      .setDescription("Start a feature and pick the matching suggestions to move to Working on it.")
      .addStringOption((option) => option.setName("name").setDescription("What you are building, such as Desert heat toggle.").setRequired(true).setMinLength(3).setMaxLength(80))
      .addStringOption((option) => option.setName("keywords").setDescription("Extra words that help find matching suggestions.").setMaxLength(200))
      .addStringOption((option) => option.setName("reference").setDescription("Optional https link, such as a roadmap issue.").setMaxLength(300)))
    .addSubcommand((command) => command
      .setName("link")
      .setDescription("Link one more suggestion to a feature in progress.")
      .addStringOption((option) => option.setName("feature").setDescription("Feature in progress.").setRequired(true).setAutocomplete(true))
      .addChannelOption((option) => option.setName("post").setDescription("Suggestion post; defaults to the current one.").addChannelTypes(ChannelType.PublicThread)))
    .addSubcommand((command) => command
      .setName("done")
      .setDescription("Mark a feature as added and update every linked suggestion.")
      .addStringOption((option) => option.setName("feature").setDescription("Feature to mark as added.").setRequired(true).setAutocomplete(true))
      .addStringOption((option) => option.setName("reference").setDescription("Optional https link, such as the release notes.").setMaxLength(300))
      .addStringOption((option) => option.setName("note").setDescription("Optional note shown in each linked suggestion.").setMaxLength(300)))
    .addSubcommand((command) => command.setName("list").setDescription("List features and how many suggestions each covers.")));

function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  return executeSuggestionsCommand(interaction);
}

class SuggestionsCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "suggestions", description: DESCRIPTION, preconditions: ["InteractionRateLimit"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, data);
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    return execute(interaction);
  }

  public override autocompleteRun(interaction: Command.AutocompleteInteraction): Promise<void> {
    return autocompleteSuggestionFeature(interaction);
  }
}

export { SuggestionsCommand, data, execute };
