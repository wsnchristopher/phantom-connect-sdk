export type DeviceCodeAuthDisplayOptions = {
  openBrowser?: boolean;
  promptOnly?: boolean;
  onPrompt?: (message: string) => void | Promise<void>;
};
