import fs from "node:fs";
import path from "node:path";

function findJavaScriptFiles(directory: string): string[] {
  if (!fs.existsSync(directory)) {
    return [];
  }

  return fs
    .readdirSync(directory, {
      withFileTypes: true,
    })
    .flatMap((entry) => {
      const itemPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return findJavaScriptFiles(itemPath);
      }

      return itemPath.endsWith(".js") ? [itemPath] : [];
    });
}

export { findJavaScriptFiles };
