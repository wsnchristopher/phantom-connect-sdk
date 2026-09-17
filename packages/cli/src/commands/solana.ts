import { Cli } from "incur";
import { varsSchema } from "../vars";
import { sendSolanaCommand } from "../actions/send-solana-transaction";
import { signSolanaCommand } from "../actions/sign-solana-message";

export const solanaCli = Cli.create("solana", {
  description: "Solana operations",
  vars: varsSchema,
});

solanaCli.command(sendSolanaCommand);
solanaCli.command(signSolanaCommand);
