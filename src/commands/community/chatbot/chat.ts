import { Command } from "@sapphire/framework";
import { InteractionContextType, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { autocompleteTaughtAnswer, executeChatCommand } from "../../../modules/community/chatbot/chatbotCommands";
import { registerApplicationCommand } from "../../../support/commands/registerApplicationCommand";

const DESCRIPTION = "Talk to the Arrakis Control chatbot, or teach it new answers.";

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
  .addSubcommand((command) => command.setName("taught").setDescription("Staff: list the answers the chatbot was taught."));

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
    return autocompleteTaughtAnswer(interaction);
  }
}

export { ChatCommand, data, execute };
