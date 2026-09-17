module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/**/*.test.ts"],
  moduleNameMapper: {
    "^incur$": "<rootDir>/src/__mocks__/incur.ts",
  },
  transformIgnorePatterns: ["node_modules/(?!(open)/)"],
};
