module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  testMatch: ["**/*.test.ts"],
  // Allow Jest to transform @msgpack/msgpack (ESM package)
  transformIgnorePatterns: ["node_modules/(?!(@msgpack)/)"],
};
