module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  collectCoverageFrom: ["src/**/*.ts", "!src/**/*.d.ts", "!src/**/*.test.ts"],
  modulePathIgnorePatterns: ["<rootDir>/_release/"],
  moduleNameMapper: {
    "^incur$": "<rootDir>/../cli/src/__mocks__/incur.ts",
    "^@phantom/cli$": "<rootDir>/../cli/src/index.ts",
    "^@phantom/constants$": "<rootDir>/../constants/src/index.ts",
  },
};
