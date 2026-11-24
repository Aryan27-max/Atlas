// A stand-in for the GitHub API, for trying the downloads page locally
// without a real token or release. Development only.
//
//   npm run mock:github            # listens on http://127.0.0.1:4010
//
// then in .env.local:
//   GITHUB_API_URL=http://127.0.0.1:4010
//   GITHUB_OWNER=demo
//   GITHUB_REPO=atlas
//   (GITHUB_TOKEN is optional, as with the real public repository)
//
// It serves one published release with the three installers, named the way
// Atlas's build names them. Each asset's browser_download_url points back at
// this server, which answers it with a redirect to example.com (a reserved
// domain), the way github.com redirects to its file storage.

import http from "node:http";

const PORT = Number(process.env.MOCK_GITHUB_PORT ?? 4010);
const VERSION = process.env.MOCK_VERSION ?? "0.2.0";

const BASE = `http://127.0.0.1:${PORT}`;
const asset = (id, name, size, digest) => ({
  id,
  name,
  size,
  ...(digest ? { digest: `sha256:${digest.repeat(32)}` } : {}),
  url: `${BASE}/repos/demo/atlas/releases/assets/${id}`,
  browser_download_url: `${BASE}/demo/atlas/releases/download/v${VERSION}/${name}`,
});

const release = {
  tag_name: `v${VERSION}`,
  published_at: new Date().toISOString(),
  assets: [
    asset(1, `Atlas-${VERSION}-arm64.dmg`, 151_234_567, "3f"),
    asset(2, `Atlas-${VERSION}-x64.dmg`, 156_700_000, "a7"),
    asset(3, `Atlas-Setup-${VERSION}-x64.exe`, 121_900_000, "0c"),
    asset(4, "SHA256SUMS.txt", 300),
  ],
};

http
  .createServer((req, res) => {
    const log = (status) => console.log(`${req.method} ${req.url} → ${status}`);
    if (/^\/repos\/[^/]+\/[^/]+\/releases\/latest$/.test(req.url ?? "")) {
      log(200);
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(release));
      return;
    }
    const file = release.assets.find((a) => a.browser_download_url === `${BASE}${req.url}`);
    if (file) {
      log(302);
      res.writeHead(302, { location: `https://example.com/atlas-mock-download/${file.name}` }).end();
      return;
    }
    log(404);
    res.writeHead(404, { "content-type": "application/json" }).end('{"message":"Not Found"}');
  })
  .listen(PORT, "127.0.0.1", () => console.log(`Mock GitHub API on http://127.0.0.1:${PORT} (release v${VERSION})`));
