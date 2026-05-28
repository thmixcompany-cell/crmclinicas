const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const root = __dirname;
const port = process.env.PORT || 4173;
const host = "0.0.0.0";

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

const server = http.createServer(async (request, response) => {
  try {
    const urlPath = new URL(request.url, "http://localhost").pathname;
    const relativePath =
      urlPath === "/"
        ? "index.html"
        : decodeURIComponent(urlPath).replace(/^\/+/, "");
    const filePath = path.resolve(root, relativePath);

    if (!filePath.toLowerCase().startsWith(root.toLowerCase())) {
      response.writeHead(403);
      response.end("Forbidden");
      return;
    }

    const content = await fs.readFile(filePath);
    response.writeHead(200, {
      "Content-Type": contentTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream",
    });
    response.end(content);
  } catch {
    response.writeHead(404);
    response.end("Not found");
  }
});

server.listen(port, host, () => {
  console.log(`Reviva CRM running on port ${port}`);
});
