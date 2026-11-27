import { Command } from "@sapphire/framework";
import { InteractionContextType, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { autocompleteChatAnswer, executeChatCommand } from "../../../modules/community/chatbot/chatbotCommands";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const DESCRIPTION = "Talk to the Arrakis Control chatbot, teach it answers, or manage what it learned.";

const data = new SlashCommandBuilder()
  .setName("chat")
  .setDescription(DESCRIPTION)
  .setContexts(InteractionContextType.Guild)
  .addSubcommand((command) => command
    .setName("ask")
    .setDescription("Ask the chatbot anything about the server, your level, storms and more.")
    .addStringOption((option) => option.setName("message").setDescription("What you want to ask or say.").setRequired(true).setMaxLength(1_500))
    .addBooleanOption((option) => option.setName("private").setDescription("Only you see the answer.")))
  .addSubcommand((command) => command
    .setName("teach")
    .setDescription("Staff: teach the chatbot an answer to a question.")
    .addStringOption((option) => option.setName("question").setDescription("How members would ask it, such as How do I join the server?").setRequired(true).setMinLength(3).setMaxLength(200))
    .addStringOption((option) => option.setName("answer").setDescription("What the chatbot should say. Use \\n for a new line and {name} for the asker.").setRequired(true).setMaxLength(1_500)))
  .addSubcommand((command) => command
    .setName("forget")
    .setDescription("Staff: remove an answer the chatbot was taught.")
    .addStringOption((option) => option.setName("answer").setDescription("Taught answer to remove.").setRequired(true).setAutocomplete(true)))
  .addSubcommand((command) => command.setName("taught").setDescription("Staff: list the answers the chatbot was taught."))
  .addSubcommand((command) => command
    .setName("learned")
    .setDescription("Staff: see what the chatbot learned from chat.")
    .addStringOption((option) => option.setName("search").setDescription("Only show learned questions containing these words.").setMaxLength(100)))
  .addSubcommand((command) => command
    .setName("unlearn")
    .setDescription("Staff: remove something the chatbot learned from chat.")
    .addStringOption((option) => option.setName("answer").setDescription("Learned answer to remove.").setRequired(true).setAutocomplete(true)))
  .addSubcommand((command) => command
    .setName("purge")
    .setDescription("Staff: forget everything the chatbot learned from chat (taught answers stay).")
    .addBooleanOption((option) => option.setName("confirm").setDescription("Set to true to confirm. This can't be undone.").setRequired(true)))
  .addSubcommand((command) => command.setName("mood").setDescription("See how the chatbot is feeling."))
  .addSubcommand((command) => command.setName("optout").setDescription("Stop the chatbot learning from your messages and forget what it learned from you."))
  .addSubcommand((command) => command.setName("optin").setDescription("Let the chatbot learn from your messages again."));

function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  return executeChatCommand(interaction);
}

class ChatCommand extends Command {
  public constructor(context: Command.LoaderContext, options: Command.Options) {
    super(context, { ...options, name: "chat", description: DESCRIPTION, preconditions: ["InteractionRateLimit"] });
  }

  public override registerApplicationCommands(registry: Command.Registry): void {
    registerApplicationCommand(registry, data);
  }

  public override chatInputRun(interaction: Command.ChatInputCommandInteraction): Promise<void> {
    return execute(interaction);
  }

  public override autocompleteRun(interaction: Command.AutocompleteInteraction): Promise<void> {
    return autocompleteChatAnswer(interaction);
  }
}

export { ChatCommand, data, execute };
