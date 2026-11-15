// Builds the frontend and serves it for browsing the Lightning mockups (`bun run mock`). They read
// sample data bundled with the page, so no API is needed. The port is `PORT` from the environment,
// or one the system picks; the address to open is printed. Stop it with Ctrl-C.
import { build, preview } from "vite";

await build({ logLevel: "warn" });
const server = await preview({
  logLevel: "warn",
  // No proxy: the mockups need no server, and must not reach one that happens to be running.
  preview: {
    host: "127.0.0.1",
    port: Number(process.env["PORT"] ?? 0),
    strictPort: true,
    proxy: {},
  },
});
const address = server.httpServer.address();
const port = typeof address === "object" && address !== null ? address.port : 0;
console.log(`Lightning mockups: http://127.0.0.1:${port}/mock/lightning`);
