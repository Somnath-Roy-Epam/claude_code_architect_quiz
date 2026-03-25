const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  webServer: {
    command: "node server.js",
    port: 8080,
    reuseExistingServer: true,
  },
  use: {
    baseURL: "http://localhost:8080",
  },
});
