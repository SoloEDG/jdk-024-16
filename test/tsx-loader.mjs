/**
 * 测试用 ESM 加载器：用 esbuild 即时转译 .ts/.tsx，
 * 让 Node 测试可以直接导入包含 UI（.tsx）的应用模块。
 * 仅用于测试，不参与生产构建。
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { transform } from "esbuild";

export async function load(url, context, nextLoad) {
  if (url.startsWith("file:")) {
    const path = fileURLToPath(url);
    if (path.endsWith(".ts") || path.endsWith(".tsx")) {
      const source = await readFile(path, "utf8");
      const result = await transform(source, {
        loader: path.endsWith(".tsx") ? "tsx" : "ts",
        format: "esm",
        sourcemap: "inline",
      });
      return { format: "module", shortCircuit: true, source: result.code };
    }
    if (path.endsWith(".css")) {
      return { format: "module", shortCircuit: true, source: "export default {};" };
    }
  }
  return nextLoad(url, context);
}
