import type { EthTransactionRequest, IEthereumChain } from "@phantom/chain-interfaces";
import { NetworkId, chainIdToNetworkId, networkIdToChainId, parseEvmChainId } from "@phantom/constants";
import { EventEmitter } from "eventemitter3";
import type { EmbeddedProvider } from "../embedded-provider";

function parseSafeChainIdNumber(chainId: string | number | bigint): number {
  const numericChainId = parseEvmChainId(chainId);

  if (numericChainId > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`Invalid chainId: ${chainId}`);
  }

  return Number(numericChainId);
}

function getTransactionNetworkId(chainId: string | number | bigint | undefined): NetworkId | undefined {
  if (chainId == null) return undefined;

  const numericChainId = parseSafeChainIdNumber(chainId);
  if (numericChainId === 0) throw new Error(`Unsupported chainId: ${chainId}`);

  const networkId = chainIdToNetworkId(numericChainId);
  if (!networkId) throw new Error(`Unsupported chainId: ${chainId}`);
  return networkId;
}

/**
 * Embedded Ethereum chain implementation that is EIP-1193 compliant
 */
export class EmbeddedEthereumChain implements IEthereumChain {
  private currentNetworkId: NetworkId = NetworkId.ETHEREUM_MAINNET;
  private _accounts: string[] = [];
  private eventEmitter: EventEmitter = new EventEmitter();

  constructor(private provider: EmbeddedProvider) {
    this.setupEventListeners();
    this.syncInitialState();
  }

  get chainId(): string {
    const chainId = networkIdToChainId(this.currentNetworkId) || 1;
    return `0x${chainId.toString(16)}`;
  }

  get accounts(): string[] {
    return this._accounts;
  }

  private ensureConnected(): void {
    if (!this.provider.isConnected()) {
      throw new Error("Ethereum chain not available. Ensure SDK is connected.");
    }
  }

  async request<T = any>(args: { method: string; params?: unknown[] }): Promise<T> {
    this.ensureConnected();
    return this.handleEmbeddedRequest(args);
  }

  // Connection methods
  connect(): Promise<string[]> {
    if (!this.provider.isConnected()) {
      throw new Error("Provider not connected. Call provider connect first.");
    }
    const addresses = this.provider.getAddresses();
    const ethAddresses = addresses.filter((a: any) => a.addressType === "Ethereum").map((a: any) => a.address);

    this.updateConnectionState(ethAddresses);
    return Promise.resolve(ethAddresses);
  }

  async disconnect(): Promise<void> {
    await this.provider.disconnect();
  }

  // Standard compliant methods (return raw values)
  async signPersonalMessage(message: string, address: string): Promise<string> {
    return await this.request<string>({
      method: "personal_sign",
      params: [message, address],
    });
  }

  async signTypedData(typedData: any, address: string): Promise<string> {
    return await this.request<string>({
      method: "eth_signTypedData_v4",
      params: [address, JSON.stringify(typedData)],
    });
  }

  async signTransaction(transaction: EthTransactionRequest): Promise<string> {
    const networkId = getTransactionNetworkId(transaction.chainId) ?? this.currentNetworkId;

    const result = await this.provider.signTransaction({
      transaction,
      networkId,
    });
    // parseTransactionResponse already converts base64url to hex for Ethereum
    return result.rawTransaction;
  }

  async sendTransaction(transaction: EthTransactionRequest): Promise<string> {
    // If the transaction has a chainId, switch to that chain first
    const transactionNetworkId = getTransactionNetworkId(transaction.chainId);
    if (transactionNetworkId) {
      await this.switchChain(networkIdToChainId(transactionNetworkId) as number);
    }

    const result = await this.provider.signAndSendTransaction({
      transaction,
      networkId: this.currentNetworkId,
    });
    if (!result.hash) {
      // Throw error as we didn't submit the transaction
      throw new Error("Transaction not submitted");
    }
    return result.hash;
  }

  switchChain(chainId: number | string): Promise<void> {
    const numericChainId = parseSafeChainIdNumber(chainId);

    const networkId = chainIdToNetworkId(numericChainId);
    if (!networkId) {
      throw new Error(`Unsupported chainId: ${chainId}`);
    }
    this.currentNetworkId = networkId;
    this.eventEmitter.emit("chainChanged", `0x${numericChainId.toString(16)}`);
    return Promise.resolve();
  }

  getChainId(): Promise<number> {
    const chainId = networkIdToChainId(this.currentNetworkId);
    return Promise.resolve(chainId || 1); // Default to mainnet
  }

  async getAccounts(): Promise<string[]> {
    return this.request({ method: "eth_accounts" });
  }

  isConnected(): boolean {
    return this.provider.isConnected() && this._accounts.length > 0;
  }

  private setupEventListeners(): void {
    // Listen to provider events and bridge to EIP-1193 events
    this.provider.on("connect", (data: any) => {
      const ethAddresses =
        data.addresses?.filter((addr: any) => addr.addressType === "Ethereum")?.map((addr: any) => addr.address) || [];

      if (ethAddresses.length > 0) {
        this.updateConnectionState(ethAddresses);
        this.eventEmitter.emit("connect", { chainId: this.chainId });
        this.eventEmitter.emit("accountsChanged", ethAddresses);
      }
    });

    this.provider.on("disconnect", () => {
      this.updateConnectionState([]);
      this.eventEmitter.emit("disconnect", { code: 4900, message: "Provider disconnected" });
      this.eventEmitter.emit("accountsChanged", []);
    });
  }

  private syncInitialState(): void {
    if (this.provider.isConnected()) {
      const addresses = this.provider.getAddresses();
      const ethAddresses = addresses.filter((a: any) => a.addressType === "Ethereum").map((a: any) => a.address);

      if (ethAddresses.length > 0) {
        this.updateConnectionState(ethAddresses);
      }
    }
  }

  private updateConnectionState(accounts: string[]): void {
    this._accounts = accounts;
  }

  private async handleEmbeddedRequest<T>(args: { method: string; params?: unknown[] }): Promise<T> {
    // Convert Ethereum RPC calls to embedded provider API
    switch (args.method) {
      case "personal_sign": {
        const [message, _address] = args.params as [string, string];
        const result = await this.provider.signEthereumMessage({
          message,
          networkId: this.currentNetworkId,
        });
        return result.signature as T;
      }

      case "eth_signTypedData_v4": {
        const [_typedDataAddress, typedDataStr] = args.params as [string, string];
        const typedData = JSON.parse(typedDataStr);

        // Compute EIP-712 hash using ethers or viem
        // We'll use a simple approach: call the backend with proper typed data signing
        // For now, pass the typed data object through signMessage with a special marker
        const typedDataResult = await this.provider.signTypedDataV4({
          typedData,
          networkId: this.currentNetworkId,
        });
        return typedDataResult.signature as T;
      }

      case "eth_signTransaction": {
        const [transaction] = args.params as [EthTransactionRequest];
        // If the transaction has a chainId, use that NetworkId
        const networkIdFromTx = getTransactionNetworkId(transaction.chainId);

        const signResult = await this.provider.signTransaction({
          transaction,
          networkId: networkIdFromTx ?? this.currentNetworkId,
        });
        return signResult.rawTransaction as T;
      }

      case "eth_sendTransaction": {
        const [transaction] = args.params as [EthTransactionRequest];
        // If the transaction has a chainId, submit it to that NetworkId
        const networkIdFromTx = getTransactionNetworkId(transaction.chainId);

        const sendResult = await this.provider.signAndSendTransaction({
          transaction,
          networkId: networkIdFromTx ?? this.currentNetworkId,
        });
        return sendResult.hash as T;
      }

      case "eth_accounts": {
        const addresses = this.provider.getAddresses();
        const ethAddr = addresses.find((a: any) => a.addressType === "Ethereum");
        return (ethAddr ? [ethAddr.address] : []) as T;
      }

      case "eth_chainId": {
        return `0x${(networkIdToChainId(this.currentNetworkId) || 1).toString(16)}` as T;
      }

      case "wallet_switchEthereumChain": {
        const [{ chainId }] = args.params as [{ chainId: string }];
        if (!chainId.toLowerCase().startsWith("0x")) {
          throw new Error(`Invalid chainId: ${chainId}`);
        }
        await this.switchChain(chainId);
        return undefined as T;
      }

      default:
        throw new Error(`Embedded provider doesn't support method: ${args.method}`);
    }
  }

  // Event methods for interface compliance
  on(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.on(event, listener);
  }

  off(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.off(event, listener);
  }
}
