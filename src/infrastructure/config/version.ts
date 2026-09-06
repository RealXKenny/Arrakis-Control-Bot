import fs from "node:fs";
import path from "node:path";

interface PackageJson {
  version?: string;
}

function findPackageJson(startDir: string): string {
  let currentDir = path.resolve(startDir);

  while (true) {
    const packageJsonPath = path.join(currentDir, "package.json");

    if (fs.existsSync(packageJsonPath)) {
      return packageJsonPath;
    }

    const parentDir = path.dirname(currentDir);

    if (parentDir === currentDir) {
      throw new Error("Unable to find package.json.");
    }

    currentDir = parentDir;
  }
}

function getBotVersion(): string {
  const environmentVersion = process.env.BOT_VERSION?.trim();

  if (environmentVersion) {
    return environmentVersion;
  }

  const packageJsonPath = findPackageJson(__dirname);
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as PackageJson;

  if (!packageJson.version) {
    throw new Error("Unable to determine the bot version: package.json does not contain a version.");
  }

  return packageJson.version;
}

export { getBotVersion };
