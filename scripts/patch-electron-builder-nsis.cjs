/**
 * Applies the upstream electron-builder fix for the assisted per-user NSIS
 * installer crash (electron-builder#8536 / PR #9564).
 *
 * electron-builder 26.8.1 still executes System::Store while resolving the
 * Windows 7 per-user Program Files path. The plugin has a known race on newer
 * Windows versions and can terminate the installer with 0xc0000005 before any
 * HanaKDE install code runs. Keep the compatibility path for Windows 7, but do
 * not load System.dll on Windows 8 or newer.
 */

const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const appBuilderRoot = path.join(root, "node_modules", "app-builder-lib");
const packagePath = path.join(appBuilderRoot, "package.json");
const templatePath = path.join(appBuilderRoot, "templates", "nsis", "multiUser.nsh");
const verifiedVulnerableVersions = new Set(["26.8.1"]);

const vulnerableBlock = `      System::Store S
      # Win7 has a per-user programfiles known folder and this can be a non-default location
      System::Call 'SHELL32::SHGetKnownFolderPath(g "\${FOLDERID_UserProgramFiles}", i \${KF_FLAG_CREATE}, p 0, *p .r2)i.r1'
      \${If} $1 == 0
        System::Call '*$2(&w\${NSIS_MAX_STRLEN} .s)'
        StrCpy $0 $1
        System::Call 'OLE32::CoTaskMemFree(p r2)'
      \${endif}
      System::Store L`;

const fixedBlock = `      \${IfNot} \${AtLeastWin8}
        System::Store S
        # Win7 has a per-user programfiles known folder and this can be a non-default location
        System::Call 'SHELL32::SHGetKnownFolderPath(g "\${FOLDERID_UserProgramFiles}", i \${KF_FLAG_CREATE}, p 0, *p .r2)i.r1'
        \${If} $1 == 0
          System::Call '*$2(&w\${NSIS_MAX_STRLEN} .s)'
          StrCpy $0 $1
          System::Call 'OLE32::CoTaskMemFree(p r2)'
        \${endif}
        System::Store L
      \${EndIf}`;

function fail(message) {
  throw new Error(`[patch-electron-builder-nsis] ${message}`);
}

function patchElectronBuilderNsis() {
  if (!fs.existsSync(packagePath) || !fs.existsSync(templatePath)) {
    console.log("[patch-electron-builder-nsis] app-builder-lib not installed, skipping");
    return { status: "skipped" };
  }

  const pkg = JSON.parse(fs.readFileSync(packagePath, "utf8"));
  let source = fs.readFileSync(templatePath, "utf8");

  if (source.includes("${IfNot} ${AtLeastWin8}") && source.includes("!include WinVer.nsh")) {
    console.log(`[patch-electron-builder-nsis] upstream fix already present in app-builder-lib ${pkg.version}`);
    return { status: "already-fixed", version: pkg.version };
  }

  if (!verifiedVulnerableVersions.has(pkg.version)) {
    fail(`app-builder-lib ${pkg.version} has an unverified vulnerable template`);
  }
  if (!source.includes(vulnerableBlock)) {
    fail(`app-builder-lib ${pkg.version} multiUser.nsh no longer matches the verified template`);
  }
  if (!source.includes("!include UAC.nsh") || source.includes("!include WinVer.nsh")) {
    fail(`app-builder-lib ${pkg.version} has an unexpected NSIS include surface`);
  }

  source = source
    .replace("!include UAC.nsh", "!include UAC.nsh\n!include WinVer.nsh")
    .replace(vulnerableBlock, fixedBlock);

  if (source.includes(vulnerableBlock) || !source.includes("${IfNot} ${AtLeastWin8}")) {
    fail("post-patch verification failed");
  }

  fs.writeFileSync(templatePath, source);
  console.log(`[patch-electron-builder-nsis] patched app-builder-lib ${pkg.version} multiUser.nsh`);
  return { status: "patched", version: pkg.version };
}

if (require.main === module) {
  try {
    patchElectronBuilderNsis();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

module.exports = { patchElectronBuilderNsis };
