import { Cli } from "incur";
import { varsSchema } from "../vars";
import { sendEvmCommand } from "../actions/send-evm-transaction";
import { signEvmCommand } from "../actions/sign-evm-personal-message";
import { signEvmTypedCommand } from "../actions/sign-evm-typed-data";
import { allowanceEvmCommand } from "../actions/get-token-allowance";

export const evmCli = Cli.create("evm", {
  description: "EVM operations",
  vars: varsSchema,
});

evmCli.command(sendEvmCommand);
evmCli.command(signEvmCommand);
evmCli.command(signEvmTypedCommand);
evmCli.command(allowanceEvmCommand);
