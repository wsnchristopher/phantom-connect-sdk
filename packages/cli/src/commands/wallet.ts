import { Cli } from "incur";
import { varsSchema } from "../vars";
import { walletStatusCommand } from "../actions/get-connection-status";
import { walletAddressesCommand } from "../actions/get-wallet-addresses";
import { walletBalancesCommand } from "../actions/get-token-balances";
import { walletRebalanceCommand } from "../actions/portfolio-rebalance";

export const walletCli = Cli.create("wallet", {
  description: "Wallet inspection and management commands",
  vars: varsSchema,
});

walletCli.command(walletStatusCommand);
walletCli.command(walletAddressesCommand);
walletCli.command(walletBalancesCommand);
walletCli.command(walletRebalanceCommand);
