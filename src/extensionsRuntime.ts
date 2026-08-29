/**
 * Extension runtime host — the "activation layer" that makes marketplace
 * extensions actually DO something, the way VS Code activates extensions on
 * a trigger (command, editor save, custom UI...).
 *
 * The real Prettier engine is loaded lazily the first time an extension
 * feature needs it, so it never bloats the initial bundle.
 */
import type { Plugin } from "prettier";

type Standalone = typeof import("prettier/standalone");

let prettierStandalone: Standalone | null = null;
const pluginCache = new Map<string, Plugin>();

/** Lazily import a single prettier plugin module and unwrap the plugin object. */
async function loadPlugin(name: string): Promise<Plugin> {
  const cached = pluginCache.get(name);
  if (cached) return cached;
  let mod: Record<string, unknown>;
  switch (name) {
    case "babel":
      mod = await import("prettier/plugins/babel");
      break;
    case "estree":
      mod = await import("prettier/plugins/estree");
      break;
    case "typescript":
      mod = await import("prettier/plugins/typescript");
      break;
    case "postcss":
      mod = await import("prettier/plugins/postcss");
      break;
    case "html":
      mod = await import("prettier/plugins/html");
      break;
    case "markdown":
      mod = await import("prettier/plugins/markdown");
      break;
    case "yaml":
      mod = await import("prettier/plugins/yaml");
      break;
    default:
      throw new Error(`Unknown prettier plugin: ${name}`);
  }
  const plugin =
    (mod[name] as Plugin | undefined) ??
    ((Object.values(mod).find((v) => v != null) ?? mod.default) as Plugin);
  pluginCache.set(name, plugin);
  return plugin;
}

/** File extensions that Prettier can handle, mapped to a parser + plugins. */
function parserFor(ext: string): { parser: string; plugins: string[] } | null {
  if (["js", "jsx", "mjs", "cjs"].includes(ext)) return { parser: "babel", plugins: ["babel", "estree"] };
  if (["ts", "tsx", "mts", "cts"].includes(ext)) return { parser: "typescript", plugins: ["typescript", "estree"] };
  if (ext === "json" || ext === "jsonc" || ext === "json5") return { parser: "json", plugins: ["babel", "estree"] };
  if (ext === "css" || ext === "scss" || ext === "less") return { parser: ext, plugins: ["postcss"] };
  if (ext === "html" || ext === "htm") return { parser: "html", plugins: ["html"] };
  if (ext === "md" || ext === "markdown") return { parser: "markdown", plugins: ["markdown"] };
  if (ext === "yaml" || ext === "yml") return { parser: "yaml", plugins: ["yaml"] };
  return null;
}

/**
 * Format `content` (the file at `path`) with the real Prettier engine.
 * Returns the formatted string, or null when the file type is unsupported
 * or the source has a syntax error. Only called when the Prettier extension
 * is installed and enabled.
 */
export async function formatWithPrettier(path: string, content: string): Promise<string | null> {
  const ext = path.includes(".") ? path.split(".").pop()!.toLowerCase() : "";
  const spec = parserFor(ext);
  if (!spec) return null;
  try {
    if (!prettierStandalone) {
      prettierStandalone = await import("prettier/standalone");
    }
    const plugins = await Promise.all(spec.plugins.map(loadPlugin));
    return await prettierStandalone.format(content, {
      parser: spec.parser,
      plugins,
      tabWidth: 2,
      printWidth: 100,
    });
  } catch {
    // Syntax error or engine failure — signal "not formatted" to the caller.
    return null;
  }
}
