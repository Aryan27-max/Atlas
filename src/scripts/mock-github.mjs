// A stand-in for the GitHub API, for trying the downloads page locally
// without a real token or release. Development only.
//
//   npm run mock:github            # listens on http://127.0.0.1:4010
//
// then in .env.local:
//   GITHUB_API_URL=http://127.0.0.1:4010
//   GITHUB_OWNER=demo
//   GITHUB_REPO=atlas
//   GITHUB_TOKEN=anything
//
// It serves one published release with the three installers, named the way
// Atlas's build names them, and answers a download with a redirect to
// example.com (a reserved domain), the way GitHub answers with a signed URL.

import http from "node:http";

const PORT = Number(process.env.MOCK_GITHUB_PORT ?? 4010);
const VERSION = process.env.MOCK_VERSION ?? "0.2.0";

const release = {
  tag_name: `v${VERSION}`,
  published_at: new Date().toISOString(),
  assets: [
    { id: 1, name: `Atlas-${VERSION}-arm64.dmg`, size: 151_234_567, digest: `sha256:${"3f".repeat(32)}` },
    { id: 2, name: `Atlas-${VERSION}-x64.dmg`, size: 156_700_000, digest: `sha256:${"a7".repeat(32)}` },
    { id: 3, name: `Atlas-Setup-${VERSION}-x64.exe`, size: 121_900_000, digest: `sha256:${"0c".repeat(32)}` },
    { id: 4, name: "SHA256SUMS.txt", size: 300 },
  ],
};

http
  .createServer((req, res) => {
    const log = (status) => console.log(`${req.method} ${req.url} → ${status}`);
    if (!req.headers.authorization?.startsWith("Bearer ")) {
      log(401);
      res.writeHead(401, { "content-type": "application/json" }).end('{"message":"Bad credentials"}');
      return;
    }
    if (/^\/repos\/[^/]+\/[^/]+\/releases\/latest$/.test(req.url ?? "")) {
      log(200);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(release));
      return;
    }
    const match = (req.url ?? "").match(/^\/repos\/[^/]+\/[^/]+\/releases\/assets\/(\d+)$/);
    const asset = match && release.assets.find((a) => a.id === Number(match[1]));
    if (asset && req.headers.accept === "application/octet-stream") {
      log(302);
      res.writeHead(302, { location: `https://example.com/atlas-mock-download/${asset.name}?signature=mock` }).end();
      return;
    }
    log(404);
    res.writeHead(404, { "content-type": "application/json" }).end('{"message":"Not Found"}');
  })
  .listen(PORT, "127.0.0.1", () => console.log(`Mock GitHub API on http://127.0.0.1:${PORT} (release v${VERSION})`));
