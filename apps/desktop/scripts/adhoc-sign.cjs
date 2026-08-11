/**
 * Ad-hoc signs the macOS app after packaging.
 *
 * We have no Apple Developer identity, so electron-builder skips signing and produces an
 * unsigned bundle. That is fatal on Apple Silicon: arm64 binaries must carry at least an
 * ad-hoc signature or the kernel refuses to execute them, which surfaces to the user as the
 * app simply not opening. `codesign --sign -` supplies that signature.
 *
 * This is not notarization and does not remove Gatekeeper's "unidentified developer" prompt —
 * it only makes the app launchable at all.
 */
const { execFileSync } = require("node:child_process");
const path = require("node:path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  // Sign nested code first, then the bundle itself: signatures must be applied inside-out, or
  // the outer signature is invalidated by the inner ones.
  execFileSync("codesign", [
    "--force",
    "--deep",
    "--sign",
    "-",
    "--timestamp=none",
    appPath,
  ], { stdio: "inherit" });

  // Fail the build rather than shipping something that will not launch.
  execFileSync("codesign", ["--verify", "--deep", "--strict", appPath], { stdio: "inherit" });
  console.log(`[nullpoint] ad-hoc signed ${appName}`);
};
