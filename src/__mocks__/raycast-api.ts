export const showToast = jest.fn();
export const Toast = {
  Style: {
    Success: "success",
    Failure: "failure",
    Animated: "animated",
  },
};

export const LocalStorage = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
  allItems: jest.fn(),
};

export const getPreferenceValues = jest.fn(() => ({
  developerFolder: "~/Developer",
  openaiApiKey: "test-api-key",
}));

export const ActionPanel = jest.fn();
export const Action = jest.fn();
export const List = jest.fn();
export const Icon = jest.fn();
export const Form = jest.fn();
export const Detail = jest.fn();
export const useNavigation = jest.fn(() => ({
  push: jest.fn(),
  pop: jest.fn(),
}));

export const environment = {
  commandName: "test-command",
  commandMode: "view",
  extensionName: "test-extension",
  raycastVersion: "1.0.0",
  supportPath: "/test/support",
  assetsPath: "/test/assets",
  isDevelopment: true,
};
