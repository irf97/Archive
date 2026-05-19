import { readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

const ROOT = resolve(".");
const API = process.env.ENS_API || "http://127.0.0.1:8787";
const MAX_HEADINGS = 18;
const MAX_SUMMARY = 900;

const FILES = [
  "argos-research-spec.html",
  "ens-navigator-spec.html",
  "operational-twin-input-contract.html",
  "operational_twin_substrate_spec.html",
  "irftek_complete_substrate_architecture.html",
  "SPEC_irftek-production.html",
  "irftek_spec.html",
  "irftek-operator-protocol.skill",
  "_skill_extracted/irftek-operator-protocol/SKILL.md",
  "LOCAL_API.md",
  "index.html",
  "server.mjs",
  "mcp-server.mjs",
  "package.json",
  "ENS-Navigator-Launcher.ps1",
  "ENS-Biotech-RD-Seed.ps1",
  "scripts/seed-biotech-rd.mjs",
  "scripts/seed-top-scientists.mjs",
  "favicon.svg"
];

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function textOnly(value) {
  return String(value || "")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/\s+/g, " ")
    .trim();
}

function fileKind(file) {
  const ext = extname(file).toLowerCase();
  if (ext === ".html") return "local html spec";
  if (ext === ".md") return "local markdown spec";
  if (ext === ".skill") return "local skill spec";
  if (ext === ".mjs" || ext === ".js") return "local javascript module";
  if (ext === ".ps1") return "local powershell script";
  if (ext === ".json") return "local json manifest";
  if (ext === ".svg") return "local visual asset";
  return "local file";
}

function domainForFile(file) {
  const name = file.toLowerCase();
  if (name.includes("argos")) return "ARGOS research and memory workflow";
  if (name.includes("ens-navigator") || name === "index.html" || name === "server.mjs" || name === "mcp-server.mjs" || name === "local_api.md") return "ENS Navigator local architecture";
  if (name.includes("operational") || name.includes("twin")) return "Operational Twin substrate";
  if (name.includes("irftek") || name.includes("robodex")) return "Robodex / IrfTek embodied execution";
  if (name.includes("biotech") || name.includes("scientists")) return "Expert Radar crawl tooling";
  return "ENS Navigator local architecture";
}

function extractHtmlTitle(raw) {
  const title = raw.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const h1 = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1];
  return textOnly(title || h1 || "");
}

function extractHeadings(raw, file) {
  const ext = extname(file).toLowerCase();
  const headings = [];
  if (ext === ".html") {
    for (const match of raw.matchAll(/<h([1-3])[^>]*>([\s\S]*?)<\/h\1>/gi)) {
      const text = textOnly(match[2]);
      if (text) headings.push(text);
    }
  } else if (ext === ".md" || ext === ".skill") {
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s{0,3}#{1,3}\s+(.+)$/);
      if (match) headings.push(match[1].trim());
    }
  } else if (ext === ".mjs" || ext === ".js") {
    for (const match of raw.matchAll(/(?:function|async function)\s+([A-Za-z0-9_]+)/g)) headings.push(`function ${match[1]}`);
    for (const match of raw.matchAll(/const\s+([A-Z0-9_]{3,})\s*=/g)) headings.push(`constant ${match[1]}`);
  } else if (ext === ".ps1") {
    for (const match of raw.matchAll(/function\s+([A-Za-z0-9_-]+)/gi)) headings.push(`function ${match[1]}`);
    for (const line of raw.split(/\r?\n/)) {
      const match = line.match(/^\s*#\s+(.+)$/);
      if (match) headings.push(match[1].trim());
    }
  } else if (ext === ".json") {
    try {
      const parsed = JSON.parse(raw);
      headings.push(...Object.keys(parsed).slice(0, MAX_HEADINGS).map(key => `json key ${key}`));
    } catch {}
  }
  return [...new Set(headings.map(x => x.trim()).filter(Boolean))].slice(0, MAX_HEADINGS);
}

function titleForFile(file, raw) {
  const ext = extname(file).toLowerCase();
  const htmlTitle = ext === ".html" ? extractHtmlTitle(raw) : "";
  if (htmlTitle) return htmlTitle;
  const headings = extractHeadings(raw, file);
  if (headings[0] && !headings[0].startsWith("function ") && !headings[0].startsWith("constant ")) return headings[0];
  return file.replace(/\\/g, "/");
}

async function buildRecord(file) {
  const abs = resolve(ROOT, file);
  if (!existsSync(abs)) return null;
  const info = await stat(abs);
  if (!info.isFile()) return null;
  const raw = await readFile(abs, "utf8");
  const rel = relative(ROOT, abs).replace(/\\/g, "/");
  const title = titleForFile(rel, raw);
  const headings = extractHeadings(raw, rel);
  const domain = domainForFile(rel);
  const sourceId = `src-local-${slug(rel)}`;
  const claimId = `claim-local-${slug(rel)}`;
  const summaryParts = [
    `Local ${fileKind(rel)} in ${domain}.`,
    headings.length ? `Extracted headings/symbols: ${headings.join("; ")}.` : "",
    `Size: ${info.size} bytes.`
  ].filter(Boolean);
  const source = {
    id: sourceId,
    title,
    type: fileKind(rel),
    domain,
    url: `local://${rel}`,
    summary: summaryParts.join(" ").slice(0, MAX_SUMMARY),
    status: "needs_review",
    tags: [domain, fileKind(rel), extname(rel).replace(".", "")].filter(Boolean),
    provenance: {
      origin: "operator_document",
      path: rel,
      sizeBytes: info.size,
      lastModified: info.mtime.toISOString()
    }
  };
  const claim = {
    id: claimId,
    domain,
    topic: "Local project file inventory",
    claim: `The local project file ${rel} is part of ${domain} and should be reviewable as an operator-provided source artifact.`,
    summary: headings.length ? `Headings/symbols extracted from the file: ${headings.join("; ")}` : "",
    confidence: 1,
    evidenceStrength: "local file metadata",
    status: "needs_review",
    sourceIds: [sourceId],
    tags: [domain, "local file inventory", fileKind(rel)],
    provenance: {
      origin: "operator_document",
      path: rel
    }
  };
  const link = {
    id: `link-${claimId}-${sourceId}`,
    fromType: "claim",
    fromId: claimId,
    relation: "supported_by",
    toType: "source",
    toId: sourceId,
    domain
  };
  return { domain, source, claim, link };
}

async function main() {
  const records = (await Promise.all(FILES.map(buildRecord))).filter(Boolean);
  const domainNames = [...new Set(records.map(record => record.domain))];
  const payload = {
    aiGenerated: false,
    origin: "operator_document",
    direction: "knowledge_to_people",
    tags: ["local files", "operator document", "project inventory"],
    domains: domainNames.map(name => ({
      id: `dom-local-${slug(name)}`,
      name,
      summary: "Local project files crawled from the ENS Navigator workspace. Treat these as operator-provided source artifacts, not external research.",
      status: "needs_review",
      tags: ["local files", "operator document"]
    })),
    sources: records.map(record => record.source),
    claims: records.map(record => record.claim),
    questions: [{
      id: "q-local-file-review-promotion",
      domain: "ENS Navigator local architecture",
      question: "Which local operator documents should be promoted into approved architecture claims after manual review?",
      priority: 4,
      status: "needs_review",
      sourceIds: records.map(record => record.source.id)
    }],
    links: records.map(record => record.link)
  };

  const res = await fetch(`${API}/api/domain-knowledge/ingest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(`Ingest failed: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  console.log(JSON.stringify({
    ok: data.ok,
    files: records.length,
    domains: domainNames.length,
    summary: data.summary
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
