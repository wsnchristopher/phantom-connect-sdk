/** @type {import('jest').Config} */
const config = {
  testEnvironment: "jsdom",
  transform: {
    "^.+\\.(ts|tsx)$": ["ts-jest"],
  },
  testMatch: ["<rootDir>/src/**/*.test.{ts,tsx}"],
  globals: {},
};

module.exports = config;
