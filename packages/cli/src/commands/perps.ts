import { Cli } from "incur";
import { varsSchema } from "../vars";
import { perpsMarketsCommand } from "../actions/get-perp-markets";
import { perpsAccountCommand } from "../actions/get-perp-account";
import { perpsPositionsCommand } from "../actions/get-perp-positions";
import { perpsOrdersCommand } from "../actions/get-perp-orders";
import { perpsHistoryCommand } from "../actions/get-perp-trade-history";
import { perpsOpenCommand } from "../actions/open-perp-position";
import { perpsCloseCommand } from "../actions/close-perp-position";
import { perpsCancelCommand } from "../actions/cancel-perp-order";
import { perpsLeverageCommand } from "../actions/update-perp-leverage";
import { perpsTransferCommand } from "../actions/transfer-spot-to-perps";
import { perpsDepositCommand } from "../actions/deposit-to-hyperliquid";
import { perpsWithdrawCommand } from "../actions/withdraw-from-perps";
import { perpsWithdrawHlSpotCommand } from "../actions/withdraw-from-hyperliquid-spot";

export const perpsCli = Cli.create("perps", {
  description: "Hyperliquid perpetuals",
  vars: varsSchema,
});

perpsCli.command(perpsMarketsCommand);
perpsCli.command(perpsAccountCommand);
perpsCli.command(perpsPositionsCommand);
perpsCli.command(perpsOrdersCommand);
perpsCli.command(perpsHistoryCommand);
perpsCli.command(perpsOpenCommand);
perpsCli.command(perpsCloseCommand);
perpsCli.command(perpsCancelCommand);
perpsCli.command(perpsLeverageCommand);
perpsCli.command(perpsTransferCommand);
perpsCli.command(perpsDepositCommand);
perpsCli.command(perpsWithdrawCommand);
perpsCli.command(perpsWithdrawHlSpotCommand);
