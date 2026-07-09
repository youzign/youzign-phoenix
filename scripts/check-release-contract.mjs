import fs from "node:fs";

const readJson = (path) => JSON.parse(fs.readFileSync(path, "utf8"));
const failures = [];
const check = (condition, message) => {
  if (!condition) failures.push(message);
};

const app = readJson("apps/editor/src-tauri/tauri.conf.json");
const versionInfo = readJson("landing/version.json");
const downloads = readJson("landing/downloads.json");
const cargo = fs.readFileSync("apps/editor/src-tauri/Cargo.toml", "utf8");
const cargoLock = fs.readFileSync("apps/editor/src-tauri/Cargo.lock", "utf8");
const cargoVersion = cargo.match(/^version\s*=\s*"([^"]+)"/m)?.[1];
const lockedVersion = cargoLock.match(/\[\[package\]\]\nname = "youzign"\nversion = "([^"]+)"/)?.[1];
const version = app.version;
const tag = process.env.GITHUB_REF_NAME;

check(/^\d+\.\d+\.\d+$/.test(version), `Tauri version must be X.Y.Z; got ${version}`);
check(cargoVersion === version, `Cargo.toml version ${cargoVersion} != Tauri version ${version}`);
check(lockedVersion === version, `Cargo.lock version ${lockedVersion} != Tauri version ${version}`);
check(versionInfo.version === version, `landing/version.json ${versionInfo.version} != app ${version}`);
check(downloads.version === version, `landing/downloads.json ${downloads.version} != app ${version}`);
check(/^https:\/\//.test(versionInfo.url), "landing/version.json must use an HTTPS download page URL");

const expectedAssets = {
  mac: `Youzign_${version}_universal.dmg`,
  win: `Youzign_${version}_x64-setup.exe`,
  linux: `Youzign_${version}_amd64.AppImage`,
};
for (const [platform, asset] of Object.entries(expectedAssets)) {
  const url = downloads[platform]?.url;
  check(typeof url === "string" && url.endsWith(`/releases/latest/download/${asset}`),
    `landing/downloads.json ${platform} URL must end with /releases/latest/download/${asset}`);
}

if (tag) {
  check(tag === `v${version}`, `release tag ${tag} != v${version}`);
}

if (failures.length) {
  console.error("Release contract failed:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`Release contract OK for Youzign v${version}${tag ? ` (${tag})` : ""}.`);
