import { z } from "incur";
import type { PhantomApiClient } from "@phantom/phantom-api-client";
import type { Logger } from "./utils/logger";
import type { BaseSessionData, ISessionManager } from "./session/types";

export const varsSchema = z.object({
  apiClient: z.custom<PhantomApiClient>(
    val => val !== undefined && val !== null,
    "apiClient must be set by the CLI middleware",
  ),
  logger: z.custom<Logger>(val => val !== undefined && val !== null, "logger must be set by the CLI middleware"),
  manager: z.custom<ISessionManager<BaseSessionData>>(
    val => val !== undefined && val !== null,
    "manager must be set by the CLI middleware",
  ),
});
