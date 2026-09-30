/**
 * What the touched files actually contain: imports and exports read from
 * disk, and a layered dependency diagram built from them. Pure apart from
 * readCodeFacts, which reads one file.
 */
import { readFileSync, statSync } from "node:fs";
import { builtinModules } from "node:module";
import { dirname, extname, join, normalize } from "node:path";

const MAX_BYTES = 256 * 1024;
const MAX_FILES = 10;
const MAX_PACKAGES = 5;
const MAX_CONTEXT = 5;
const CODE_EXT = /\.(m?[jt]sx?|cjs|py|css|scss|vue|svelte|astro)$/i;
const BUILTINS = new Set(builtinModules);

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

/** @returns {{ imports: string[], exports: string[], lines: number }} */
export function factsFromSource(source, filePath = "") {
  const text = String(source || "");
  const ext = extname(filePath).toLowerCase();
  const imports = [];
  const exports = [];

  if (ext === ".py") {
    for (const m of text.matchAll(/^\s*from\s+([\w.]+)\s+import\b/gm)) imports.push(m[1]);
    for (const m of text.matchAll(/^\s*import\s+([\w.]+)/gm)) imports.push(m[1]);
    for (const m of text.matchAll(/^(?:async\s+)?def\s+([A-Za-z_]\w*)|^class\s+([A-Za-z_]\w*)/gm)) {
      const name = m[1] || m[2];
      if (!name.startsWith("_")) exports.push(name);
    }
  } else if (ext === ".css" || ext === ".scss") {
    for (const m of text.matchAll(/@(?:import|use)\s+(?:url\()?["']([^"']+)["']/g)) imports.push(m[1]);
  } else {
    for (const m of text.matchAll(/\bimport\s+(?:type\s+)?(?:[\w*{}\s,$]+?\s+from\s+)?["']([^"']+)["']/g)) imports.push(m[1]);
    for (const m of text.matchAll(/\bexport\s+(?:type\s+)?[*{][^;]*?\sfrom\s+["']([^"']+)["']/g)) imports.push(m[1]);
    for (const m of text.matchAll(/\b(?:require|import)\(\s*["']([^"']+)["']\s*\)/g)) imports.push(m[1]);
    for (const m of text.matchAll(
      /\bexport\s+(?:default\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum)\s+([A-Za-z_$][\w$]*)/g
    )) exports.push(m[1]);
    if (/\bexport\s+default\b/.test(text) && !/\bexport\s+default\s+(?:async\s+)?(?:function|class)\s+\w/.test(text)) {
      exports.push("default");
    }
    for (const m of text.matchAll(/\bexport\s*\{([^}]+)\}(?!\s*from)/g)) {
      for (const part of m[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop()?.trim();
        if (name) exports.push(name);
      }
    }
    if (/\bmodule\.exports\b/.test(text)) exports.push("module.exports");
  }

  return {
    imports: unique(imports).slice(0, 40),
    exports: unique(exports).slice(0, 20),
    lines: text ? text.split("\n").length : 0,
  };
}

const RESOLVE_EXT = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js"];

/** Project-relative path of a local import that exists on disk, else null. */
export function resolveOnDisk(root, fromPath, spec) {
  if (!root || !isLocal(spec)) return null;
  const bases = spec.startsWith(".")
    ? [normalize(join(dirname(fromPath), spec))]
    : /^[@~#]\//.test(spec)
      ? [spec.slice(2), `src/${spec.slice(2)}`]
      : [spec.replace(/^\//, "")];
  for (const base of bases) {
    if (base.startsWith("..")) continue;
    for (const ext of RESOLVE_EXT) {
      try {
        if (statSync(join(root, base + ext)).isFile()) return base + ext;
      } catch {
        // try the next candidate
      }
    }
  }
  return null;
}

/**
 * Facts for a file on disk, or null when it is not code or cannot be read.
 * `resolved` maps local import specifiers to the project files they point at.
 */
export function readCodeFacts(absPath, relPath = absPath, root = null) {
  if (!CODE_EXT.test(relPath)) return null;
  try {
    if (statSync(absPath).size > MAX_BYTES) return null;
    const source = readFileSync(absPath, "utf8");
    const facts = factsFromSource(source, relPath);
    const resolved = {};
    for (const spec of facts.imports.filter(isLocal).slice(0, 12)) {
      const hit = resolveOnDisk(root, relPath, spec);
      if (hit) resolved[spec] = hit;
    }
    return { ...facts, resolved, source };
  } catch {
    return null;
  }
}

function packageName(spec) {
  const clean = spec.replace(/^node:/, "");
  if (clean.startsWith("@")) return clean.split("/").slice(0, 2).join("/");
  return clean.split("/")[0];
}

function isLocal(spec) {
  return spec.startsWith(".") || spec.startsWith("/") || /^[@~]\//.test(spec) || spec.startsWith("#");
}

function stripExt(p) {
  return p.replace(/\.(m?[jt]sx?|cjs)$/i, "").replace(/\/index$/, "");
}

/** Resolve a local import to one of the touched files, if it is one. */
export function resolveLocal(fromPath, spec, knownPaths) {
  let target;
  if (spec.startsWith(".")) target = normalize(join(dirname(fromPath), spec));
  else if (/^[@~#]\//.test(spec)) target = spec.slice(2);
  else target = spec.replace(/^\//, "");
  const want = stripExt(target);
  return (
    knownPaths.find((p) => stripExt(p) === want) ||
    knownPaths.find((p) => stripExt(p) === `src/${want}`) ||
    null
  );
}

function label(path) {
  const parts = path.split("/");
  const base = parts.pop();
  if (/^(index|page|route|layout)\.[a-z]+$/i.test(base) && parts.length) {
    return `${parts.slice(-1)[0]}/${base}`;
  }
  return base;
}

/**
 * Layered dependency diagram of the touched files, the unchanged project files
 * they import ("context"), and the packages they use. Layer 0 holds files
 * nothing else in the change imports; each import pushes its target one layer
 * down; packages sit at the bottom.
 * @param {Record<string, { imports?: string[] }>} code
 * @param {{ order?: string[], active?: string, newFiles?: string[] }} [opts]
 */
export function buildSchema(code, { order = [], active = null, newFiles = [] } = {}) {
  const known = Object.keys(code || {});
  if (!known.length) return null;
  const recent = [...order].reverse().filter((p) => known.includes(p));
  const files = unique([...recent, ...known]).slice(0, MAX_FILES);

  const edges = [];
  const pkgUse = new Map();
  const contextUse = new Map();
  for (const from of files) {
    for (const spec of code[from]?.imports || []) {
      if (isLocal(spec)) {
        const to = resolveLocal(from, spec, files) || code[from]?.resolved?.[spec] || null;
        if (!to || to === from) continue;
        edges.push({ from, to });
        if (!files.includes(to)) contextUse.set(to, (contextUse.get(to) || 0) + 1);
      } else {
        const pkg = packageName(spec);
        if (BUILTINS.has(pkg) || BUILTINS.has(spec.replace(/^node:/, ""))) continue;
        edges.push({ from, to: `pkg:${pkg}` });
        pkgUse.set(pkg, (pkgUse.get(pkg) || 0) + 1);
      }
    }
  }
  const packages = [...pkgUse.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_PACKAGES).map(([p]) => p);
  const context = [...contextUse.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_CONTEXT).map(([p]) => p);
  const keep = new Set([...files, ...context, ...packages.map((p) => `pkg:${p}`)]);
  const kept = unique(edges.filter((e) => keep.has(e.to)).map((e) => `${e.from}\u0000${e.to}`)).map((k) => {
    const [from, to] = k.split("\u0000");
    return { from, to };
  });

  const local = [...files, ...context];
  const layer = new Map(local.map((f) => [f, 0]));
  for (let pass = 0; pass < local.length; pass += 1) {
    let changed = false;
    for (const { from, to } of kept) {
      if (to.startsWith("pkg:")) continue;
      const want = (layer.get(from) || 0) + 1;
      if (want > (layer.get(to) || 0) && want < local.length) {
        layer.set(to, want);
        changed = true;
      }
    }
    if (!changed) break;
  }
  const fileDepth = Math.max(0, ...local.map((f) => layer.get(f) || 0));

  const nodes = [
    ...files.map((f) => ({
      id: f,
      label: label(f),
      kind: "file",
      layer: layer.get(f) || 0,
      active: f === active,
      isNew: newFiles.includes(f),
      exports: (code[f]?.exports || []).slice(0, 3),
    })),
    ...context.map((f) => ({ id: f, label: label(f), kind: "context", layer: layer.get(f) || 0 })),
    ...packages.map((p) => ({ id: `pkg:${p}`, label: p, kind: "package", layer: fileDepth + 1 })),
  ];
  return { nodes, edges: kept };
}
