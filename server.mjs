import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";

const ROOT = resolve(".");
const PORT = Number(process.env.PORT || 8787);
const DATA_DIR = join(ROOT, "data");
const DATA_FILE = join(DATA_DIR, "oncology-experts.json");
const CRAWL_FILE = join(DATA_DIR, "crawl-jobs.json");
const PIPELINE_FILE = join(DATA_DIR, "pipeline-experts.json");
const INGEST_LOG_FILE = join(DATA_DIR, "ingest-log.json");
const SAVED_VIEWS_FILE = join(DATA_DIR, "saved-views.json");
const DOMAIN_KNOWLEDGE_FILE = join(DATA_DIR, "domain-knowledge.json");
const OUTCOMES_FILE = join(DATA_DIR, "outcomes.json");
const OPERATIONAL_TWINS_FILE = join(DATA_DIR, "operational-twins.json");
const MISSIONS_FILE = join(DATA_DIR, "missions.json");
const AGENT_REGISTRY_FILE = join(DATA_DIR, "agent-registry.json");
const AGENT_RUNS_FILE = join(DATA_DIR, "agent-runs.json");
const ARTIFACTS_FILE = join(DATA_DIR, "artifacts.json");
const ARTIFACT_LINKS_FILE = join(DATA_DIR, "artifact-links.json");
const REVIEWS_FILE = join(DATA_DIR, "reviews.json");
const POLICIES_FILE = join(DATA_DIR, "policies.json");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8"
};

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, {
    "content-type": type,
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET,POST,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  if (Buffer.isBuffer(body)) res.end(body);
  else res.end(typeof body === "string" ? body : JSON.stringify(body, null, 2));
}

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

const TAG_CATEGORIES = [
  "field", "subfield", "topic", "method", "domain", "geo", "institution",
  "archetype", "rank_signal", "contactability", "compliance", "source"
];
const SELECTION_TAG_CATEGORIES = [
  "field", "subfield", "topic", "method", "domain", "geo", "archetype",
  "rank_signal", "contactability"
];

function arrayOf(value) {
  if (Array.isArray(value)) return value.map(String).map(x => x.trim()).filter(Boolean);
  return String(value || "").split(/\r?\n/).map(x => x.trim()).filter(Boolean);
}

function splitTagValues(value) {
  return String(value || "")
    .split(/[\n,;|/]+/)
    .map(x => x.trim())
    .filter(Boolean);
}

function tagOf(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/[^a-z0-9+.\-&\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tagsOf(value) {
  if (Array.isArray(value)) return value.map(tagOf).filter(Boolean);
  return splitTagValues(value).map(tagOf).filter(Boolean);
}

function addTag(list, value) {
  const tag = tagOf(value);
  if (!tag) return;
  if (!list.includes(tag)) list.push(tag);
}

function emptyTagGroups() {
  return Object.fromEntries(TAG_CATEGORIES.map(key => [key, []]));
}

function sourceTagValues(links) {
  const values = [];
  for (const raw of arrayOf(links)) {
    const link = String(raw || "");
    if (/pubmed|pmc|papers/i.test(link)) values.push("paper");
    else if (/hospital|medicine|health|clinic|care|provider|faculty|profile/i.test(link)) values.push("public profile");
    else if (/guideline|protocol|consensus/i.test(link)) values.push("guideline");
    else if (/podcast|audio/i.test(link)) values.push("podcast");
    else if (/github/i.test(link)) values.push("github");
    else if (/patent/i.test(link)) values.push("patent");
    else if (/conference|proceedings|abstract/i.test(link)) values.push("conference");
    else values.push("web");
  }
  return [...new Set(values)];
}

function normalizeTagGroups(source = {}) {
  const groups = emptyTagGroups();
  const incoming = source.tagGroups || source.tag_groups || {};
  for (const key of TAG_CATEGORIES) {
    const raw = incoming[key] ?? source[key];
    for (const tag of tagsOf(raw)) addTag(groups[key], tag);
  }

  if (!groups.topic.length) {
    for (const term of arrayOf(source.tags || source.tag_list || source.tagList || source.labels || source.categories)) {
      addTag(groups.topic, term);
    }
    for (const term of arrayOf(source.queryTerms || source.query_terms || source.keywords)) {
      addTag(groups.topic, term);
    }
  }
  if (!groups.field.length && (source.field || source.domain || source.cancerType)) {
    addTag(groups.field, source.field || source.domain || source.cancerType);
  }
  if (!groups.subfield.length && (source.subfield || source.specialty || source.niche)) {
    addTag(groups.subfield, source.subfield || source.specialty || source.niche);
  }
  if (!groups.domain.length && (source.domain || source.cancerType)) addTag(groups.domain, source.domain || source.cancerType);
  if (!groups.geo.length && source.geography) addTag(groups.geo, source.geography);
  if (!groups.institution.length && source.institution) addTag(groups.institution, source.institution);
  if (!groups.archetype.length && source.archetype) addTag(groups.archetype, source.archetype);
  if (!groups.rank_signal.length && (source.rankSignal || source.rank_signal || source.prestige || source.awards)) {
    addTag(groups.rank_signal, source.rankSignal || source.rank_signal || source.prestige || source.awards);
  }
  if (!groups.contactability.length && (source.contactability || source.contactRoute || source.contact_route || source.likelyNetwork || source.likely_network)) {
    addTag(groups.contactability, source.contactability || source.contactRoute || source.contact_route || source.likelyNetwork || source.likely_network);
  }
  const signalText = [
    ...arrayOf(source.tags),
    ...arrayOf(source.queryTerms || source.query_terms),
    ...TAG_CATEGORIES.flatMap(key => arrayOf(groups[key]))
  ].join(" ").toLowerCase();
  if (!groups.rank_signal.length) {
    if (/top\s*1\s*percent|top scientist|highly cited|clarivate|nobel|turing|fields medal|nas|nae|hhmi|lasker|breakthrough prize/.test(signalText)) {
      addTag(groups.rank_signal, signalText.includes("top 1") ? "top 1 percent" : "elite signal");
    }
  }
  if (!groups.contactability.length) {
    if (/direct|email|lab page|faculty|profile|linkedin/.test(signalText)) addTag(groups.contactability, "direct/public profile");
    else if (/glg|alphasights|guidepoint|third bridge|dialectica|tegus|atheneum|techspert/.test(signalText)) addTag(groups.contactability, "expert network");
  }
  if (!groups.compliance.length && source.complianceFlags) addTag(groups.compliance, source.complianceFlags);
  if (!groups.source.length) groups.source.push(...sourceTagValues(source.evidenceLinks || source.evidence_links || source.evidence));

  for (const key of TAG_CATEGORIES) groups[key] = [...new Set(groups[key])].slice(0, 12);
  return groups;
}

function flattenTagGroups(groups, keys = TAG_CATEGORIES) {
  return [...new Set(keys.flatMap(key => arrayOf(groups?.[key])) )].slice(0, 48);
}

function matchTagValue(existing, requested) {
  return existing === requested || existing.includes(requested) || requested.includes(existing);
}

function deriveTags(source = {}) {
  return flattenTagGroups(normalizeTagGroups(source));
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeScores(raw = {}) {
  return {
    relevance: num(raw.relevance, 3),
    recency: num(raw.recency, 3),
    decision: num(raw.decision ?? raw.decision_proximity, 3),
    independence: num(raw.independence, 3),
    accessibility: num(raw.accessibility, 3),
    risk: Math.max(-5, Math.min(0, num(raw.risk, 0)))
  };
}

function normalizeExpert(raw) {
  const source = raw || {};
  const cancerType = source.cancerType || source.cancer_type || source.cancer || source.domain || "Cancer / unspecified";
  const name = String(source.name || "").trim();
  const institution = String(source.institution || source.company || source.affiliation || "").trim();
  const niche = String(source.niche || source.thesis_fit || source.thesisFit || "").trim();
  const approach = String(source.approach || source.niche_approach || source.method || source.thesis_fit || source.thesisFit || "").trim();
  const id = String(source.id || `onc-${slug(cancerType)}-${slug(name || institution || Date.now())}`).trim();
  const tagGroups = normalizeTagGroups({ ...source, cancerType, institution, niche, approach });
  const tags = flattenTagGroups(tagGroups, SELECTION_TAG_CATEGORIES);

  return {
    id,
    name,
    cancerType,
    domain: source.domain_area || source.specialty || source.domain || "Oncology",
    geography: source.geography || "",
    institution,
    archetype: source.archetype || source.expert_depth || "medical oncologist",
    likelyNetwork: source.likelyNetwork || source.likely_network || "Direct",
    contactRoute: source.contactRoute || source.contact_route || "",
    niche,
    approach,
    queryTerms: arrayOf(source.queryTerms || source.query_terms || source.keywords),
    tags,
    tagGroups,
    evidenceLinks: arrayOf(source.evidenceLinks || source.evidence_links || source.evidence),
    questionsToAsk: arrayOf(source.questionsToAsk || source.questions_to_ask || source.questions),
    complianceFlags: source.complianceFlags || source.compliance_flags || "",
    callValue: num(source.callValue ?? source.call_value_estimate ?? source.call_value, 0),
    scores: normalizeScores(source.scores || source.score || {}),
    updatedAt: source.updatedAt || new Date().toISOString()
  };
}

function mergeExperts(existing, incoming) {
  const byId = new Map();
  for (const expert of existing) byId.set(expert.id, normalizeExpert(expert));
  for (const expert of incoming) byId.set(expert.id, normalizeExpert(expert));
  return [...byId.values()];
}

async function readStoredExperts() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(DATA_FILE)) return [];
  const raw = await readFile(DATA_FILE, "utf8");
  const parsed = raw.trim() ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed.map(normalizeExpert) : [];
}

async function readExperts() {
  return readStoredExperts();
}

async function writeExperts(experts) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(experts.map(normalizeExpert), null, 2), "utf8");
}

async function readJsonFile(file, fallback = []) {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(file)) return fallback;
  const raw = await readFile(file, "utf8");
  const cleaned = String(raw || "").replace(/^\uFEFF/, "").trim();
  if (!cleaned) return fallback;
  const parsed = JSON.parse(cleaned);
  return parsed == null ? fallback : parsed;
}

async function writeJsonFile(file, value) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2), "utf8");
}

const DOMAIN_KNOWLEDGE_KEYS = ["domains", "claims", "sources", "people", "questions", "links", "agentRuns"];
const DOMAIN_KNOWLEDGE_PREFIX = {
  domains: "dom",
  claims: "claim",
  sources: "src",
  people: "person",
  questions: "q",
  links: "link",
  agentRuns: "run"
};
const REVIEWABLE_DOMAIN_KNOWLEDGE = new Set(["domains", "claims", "sources", "people", "questions", "links"]);

function emptyDomainKnowledgeState() {
  return Object.fromEntries(DOMAIN_KNOWLEDGE_KEYS.map(key => [key, []]));
}

function domainKnowledgeCounts(state) {
  return Object.fromEntries(DOMAIN_KNOWLEDGE_KEYS.map(key => [key, Array.isArray(state?.[key]) ? state[key].length : 0]));
}

function compactObject(value) {
  const out = {};
  for (const [key, item] of Object.entries(value || {})) {
    if (item === undefined) continue;
    if (Array.isArray(item) && !item.length) continue;
    out[key] = item;
  }
  return out;
}

function stringArray(...values) {
  return [...new Set(values.flatMap(value => {
    if (Array.isArray(value)) return value;
    if (value == null || value === "") return [];
    return String(value).split(/[\n,;|]+/);
  }).map(value => String(value || "").trim()).filter(Boolean))];
}

function normalizeDirection(value) {
  const direction = String(value || "").trim();
  return ["person_to_knowledge", "knowledge_to_people"].includes(direction) ? direction : "";
}

function stableDomainKnowledgeId(collection, raw = {}) {
  const explicit = raw.id || raw._id || raw.uid;
  if (explicit) return String(explicit).trim();
  const basis = raw.key || raw.slug || raw.name || raw.title || raw.label || raw.url || raw.uri ||
    raw.href || raw.text || raw.claim || raw.question || raw.description ||
    [raw.from || raw.fromId || raw.sourceId, raw.to || raw.toId || raw.targetId, raw.type || raw.relationship].filter(Boolean).join("-");
  const fingerprint = slug(basis || `${collection}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`) || Math.random().toString(36).slice(2, 10);
  return `${DOMAIN_KNOWLEDGE_PREFIX[collection] || "dk"}-${fingerprint}`.slice(0, 96);
}

function domainKnowledgeDedupeKey(collection, item) {
  if (!item) return "";
  if (collection === "links") {
    return [
      item.from || item.fromId || item.sourceId || "",
      item.to || item.toId || item.targetId || "",
      item.type || item.relationship || item.label || ""
    ].map(value => String(value).toLowerCase()).join("|");
  }
  const value = item.url || item.uri || item.href || item.name || item.title || item.text || item.claim ||
    item.question || item.label || item.id;
  return String(value || item.id || "").toLowerCase().trim();
}

function normalizeDomainKnowledgeRecord(collection, raw = {}, context = {}) {
  const now = context.now || new Date().toISOString();
  const agentRunId = raw.agentRunId || raw.agent_run_id || context.agentRunId || "";
  const direction = normalizeDirection(raw.direction || context.direction);
  const createdAt = raw.createdAt || raw.created_at || now;
  const updatedAt = raw.updatedAt || raw.updated_at || now;
  const statusFallback = REVIEWABLE_DOMAIN_KNOWLEDGE.has(collection) && context.aiGenerated ? "inbox" : "";
  const status = String(raw.status || raw.reviewStatus || raw.review_status || statusFallback).trim();
  const confidence = raw.confidence ?? raw.score ?? raw.weight ?? null;
  const evidence = stringArray(raw.evidence, raw.evidenceIds, raw.evidence_ids, raw.evidenceLinks, raw.evidence_links);
  const sourceIds = stringArray(raw.sourceIds, raw.source_ids, raw.sourceId, raw.source_id, raw.source);
  const personIds = stringArray(raw.personIds, raw.person_ids, raw.peopleIds, raw.people_ids, raw.personId, raw.person_id, raw.expertIds, raw.expert_ids, raw.expertId, raw.expert_id);
  const domainIds = stringArray(raw.domainIds, raw.domain_ids, raw.domainId, raw.domain_id, raw.domain);
  const claimIds = stringArray(raw.claimIds, raw.claim_ids, raw.claimId, raw.claim_id);
  const questionIds = stringArray(raw.questionIds, raw.question_ids, raw.questionId, raw.question_id);
  const tags = stringArray(raw.tags, raw.tag, context.tags);
  const provenance = compactObject({
    ...(typeof raw.provenance === "object" && raw.provenance ? raw.provenance : {}),
    ...(typeof context.provenance === "object" && context.provenance ? context.provenance : {}),
    agentRunId: agentRunId || undefined,
    direction: direction || undefined,
    sourceIds,
    personIds,
    domainIds,
    claimIds,
    questionIds
  });

  return compactObject({
    ...raw,
    id: stableDomainKnowledgeId(collection, raw),
    name: raw.name || raw.title || raw.label,
    title: raw.title || raw.name || raw.label,
    text: raw.text || raw.claim || raw.question || raw.summary || raw.description,
    url: raw.url || raw.uri || raw.href,
    type: raw.type || raw.kind || raw.relationship,
    from: raw.from || raw.fromId || raw.sourceId,
    to: raw.to || raw.toId || raw.targetId,
    tags,
    confidence,
    evidence,
    status,
    agentRunId,
    direction,
    sourceIds,
    personIds,
    domainIds,
    claimIds,
    questionIds,
    provenance,
    createdAt,
    updatedAt
  });
}

function mergeDomainKnowledgeCollection(collection, existing = [], incoming = [], context = {}) {
  const now = context.now || new Date().toISOString();
  const byId = new Map();
  const keyToId = new Map();

  for (const raw of Array.isArray(existing) ? existing : []) {
    const item = normalizeDomainKnowledgeRecord(collection, raw, { now, aiGenerated: false });
    byId.set(item.id, item);
    const key = domainKnowledgeDedupeKey(collection, item);
    if (key) keyToId.set(key, item.id);
  }

  let added = 0;
  let updated = 0;
  for (const raw of Array.isArray(incoming) ? incoming : []) {
    if (!raw || typeof raw !== "object") continue;
    const item = normalizeDomainKnowledgeRecord(collection, raw, { ...context, now });
    const key = domainKnowledgeDedupeKey(collection, item);
    const existingId = byId.has(item.id) ? item.id : keyToId.get(key);
    if (existingId) {
      const prev = byId.get(existingId);
      const merged = {
        ...prev,
        ...item,
        id: existingId,
        tags: stringArray(prev.tags, item.tags),
        evidence: stringArray(prev.evidence, item.evidence),
        sourceIds: stringArray(prev.sourceIds, item.sourceIds),
        personIds: stringArray(prev.personIds, item.personIds),
        domainIds: stringArray(prev.domainIds, item.domainIds),
        claimIds: stringArray(prev.claimIds, item.claimIds),
        questionIds: stringArray(prev.questionIds, item.questionIds),
        provenance: compactObject({ ...(prev.provenance || {}), ...(item.provenance || {}) }),
        createdAt: prev.createdAt || item.createdAt || now,
        updatedAt: now
      };
      byId.set(existingId, compactObject(merged));
      updated += 1;
    } else {
      byId.set(item.id, item);
      if (key) keyToId.set(key, item.id);
      added += 1;
    }
  }

  return { items: [...byId.values()], added, updated };
}

function normalizeDomainKnowledgeState(raw = {}, context = {}) {
  const normalized = emptyDomainKnowledgeState();
  for (const key of DOMAIN_KNOWLEDGE_KEYS) {
    normalized[key] = mergeDomainKnowledgeCollection(key, [], Array.isArray(raw?.[key]) ? raw[key] : [], {
      ...context,
      aiGenerated: false
    }).items;
  }
  normalized.counts = domainKnowledgeCounts(normalized);
  return normalized;
}

async function readDomainKnowledge() {
  const parsed = await readJsonFile(DOMAIN_KNOWLEDGE_FILE, emptyDomainKnowledgeState());
  return normalizeDomainKnowledgeState(parsed);
}

async function writeDomainKnowledge(state) {
  const normalized = normalizeDomainKnowledgeState(state);
  await writeJsonFile(DOMAIN_KNOWLEDGE_FILE, normalized);
  return normalized;
}

function normalizeAgentRun(raw = {}, context = {}) {
  const now = context.now || new Date().toISOString();
  const direction = normalizeDirection(raw.direction || context.direction);
  return normalizeDomainKnowledgeRecord("agentRuns", {
    ...raw,
    id: raw.id || raw.agentRunId || raw.agent_run_id,
    status: raw.status || "completed",
    direction,
    startedAt: raw.startedAt || raw.started_at || raw.createdAt || now,
    completedAt: raw.completedAt || raw.completed_at || raw.updatedAt || now
  }, { ...context, aiGenerated: false, now });
}

async function ingestDomainKnowledgePayload(body = {}) {
  const now = new Date().toISOString();
  const current = await readDomainKnowledge();
  const agentRunRaw = body.agentRun || body.agent_run || body.run || {};
  const direction = normalizeDirection(body.direction || agentRunRaw.direction);
  const hasAgentOutput = Boolean(body.agentRun || body.agent_run || body.run || body.domains || body.claims || body.sources || body.people || body.questions || body.links);
  // Allow callers to explicitly label payload provenance. We default to treating any
  // payload containing output arrays as AI-generated, but research ingestion can opt out.
  const aiGenerated = typeof body.aiGenerated === "boolean" ? body.aiGenerated : hasAgentOutput;
  const origin = String(body.origin || body.provenanceOrigin || body.provenance_origin || "").trim();
  const agentRun = Object.keys(agentRunRaw).length ? normalizeAgentRun(agentRunRaw, { now, direction }) : null;
  const agentRunId = body.agentRunId || body.agent_run_id || agentRun?.id || "";
  const next = { ...current };
  const summary = {};

  if (agentRun) {
    const result = mergeDomainKnowledgeCollection("agentRuns", current.agentRuns, [agentRun], { now });
    next.agentRuns = result.items;
    summary.agentRuns = { added: result.added, updated: result.updated, total: result.items.length };
  }

  for (const key of ["domains", "claims", "sources", "people", "questions", "links"]) {
    const result = mergeDomainKnowledgeCollection(key, current[key], Array.isArray(body[key]) ? body[key] : [], {
      now,
      aiGenerated,
      agentRunId,
      direction,
      tags: body.tags,
      provenance: origin ? { origin } : undefined
    });
    next[key] = result.items;
    summary[key] = { added: result.added, updated: result.updated, total: result.items.length };
  }

  next.counts = domainKnowledgeCounts(next);
  await writeJsonFile(DOMAIN_KNOWLEDGE_FILE, next);
  return { state: next, summary };
}

function normalizePipelineExpert(raw = {}) {
  const now = new Date().toISOString();
  const tagGroups = normalizeTagGroups(raw);
  const status = String(raw.status || "found").trim() || "found";
  return {
    ...raw,
    id: String(raw.id || `pipe-${slug(raw.name || raw.sourceExpertId || Date.now())}-${Math.random().toString(36).slice(2, 7)}`),
    sourceExpertId: raw.sourceExpertId || raw.source_expert_id || "",
    sourceCatalog: raw.sourceCatalog || raw.source_catalog || "expert-radar",
    sourceNiche: raw.sourceNiche || raw.source_niche || raw.niche || "",
    name: String(raw.name || "").trim(),
    domain: raw.domain || raw.cancerType || raw.cancer_type || "",
    archetype: raw.archetype || "",
    tagGroups,
    tags: flattenTagGroups(tagGroups, SELECTION_TAG_CATEGORIES),
    evidenceLinks: Array.isArray(raw.evidenceLinks) ? raw.evidenceLinks.join("\n") : String(raw.evidenceLinks || raw.evidence_links || ""),
    likelyNetwork: raw.likelyNetwork || raw.likely_network || "Direct",
    contactRoute: raw.contactRoute || raw.contact_route || "",
    email: raw.email || "",
    linkedIn: raw.linkedIn || raw.linkedin || raw.linked_in || "",
    labPage: raw.labPage || raw.lab_page || "",
    contactStatus: raw.contactStatus || raw.contact_status || "not started",
    lastContacted: raw.lastContacted || raw.last_contacted || "",
    nextAction: raw.nextAction || raw.next_action || "",
    responseNotes: raw.responseNotes || raw.response_notes || "",
    thesisFit: raw.thesisFit || raw.thesis_fit || raw.niche || "",
    questionsToAsk: Array.isArray(raw.questionsToAsk) ? raw.questionsToAsk.join("\n") : String(raw.questionsToAsk || raw.questions_to_ask || ""),
    complianceFlags: raw.complianceFlags || raw.compliance_flags || "",
    callValue: num(raw.callValue ?? raw.call_value ?? raw.call_value_estimate, 0),
    status,
    scores: normalizeScores(raw.scores || {}),
    createdAt: raw.createdAt || raw.created_at || now,
    updatedAt: raw.updatedAt || raw.updated_at || now
  };
}

async function readPipelineExperts() {
  const parsed = await readJsonFile(PIPELINE_FILE, []);
  return Array.isArray(parsed) ? parsed.map(normalizePipelineExpert).filter(e => e.name) : [];
}

async function writePipelineExperts(experts) {
  await writeJsonFile(PIPELINE_FILE, (Array.isArray(experts) ? experts : []).map(normalizePipelineExpert).filter(e => e.name));
}

function normalizeSavedView(raw = {}) {
  return {
    id: String(raw.id || `view-${slug(raw.name || Date.now())}`),
    name: String(raw.name || "Saved view").trim(),
    search: String(raw.search || raw.query || ""),
    filters: Object.fromEntries(TAG_CATEGORIES.map(key => [key, tagsOf(raw.filters?.[key] || raw.tagGroups?.[key] || [])])),
    limit: raw.limit || "20",
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || new Date().toISOString()
  };
}

async function readSavedViews() {
  const parsed = await readJsonFile(SAVED_VIEWS_FILE, []);
  return Array.isArray(parsed) ? parsed.map(normalizeSavedView).filter(v => v.name) : [];
}

async function writeSavedViews(views) {
  await writeJsonFile(SAVED_VIEWS_FILE, (Array.isArray(views) ? views : []).map(normalizeSavedView));
}

function normalizeOutcomeTask(raw = {}) {
  const now = new Date().toISOString();
  const status = String(raw.status || "backlog").trim() || "backlog";
  return {
    ...raw,
    id: String(raw.id || `task-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`),
    title: String(raw.title || raw.name || "Untitled task").trim(),
    detail: String(raw.detail || raw.description || "").trim(),
    domain: String(raw.domain || "General").trim(),
    status,
    priority: Math.max(1, Math.min(5, num(raw.priority, 3))),
    sourceIds: stringArray(raw.sourceIds, raw.source_ids),
    claimIds: stringArray(raw.claimIds, raw.claim_ids),
    questionIds: stringArray(raw.questionIds, raw.question_ids),
    dependsOn: stringArray(raw.dependsOn, raw.depends_on),
    createdAt: raw.createdAt || raw.created_at || now,
    updatedAt: raw.updatedAt || raw.updated_at || now
  };
}

function normalizeOutcomeProject(raw = {}) {
  const now = new Date().toISOString();
  return {
    ...raw,
    id: String(raw.id || `out-${slug(raw.name || "project")}-${Math.random().toString(36).slice(2, 7)}`).slice(0, 96),
    name: String(raw.name || "Outcome Project").trim(),
    domains: stringArray(raw.domains, raw.domain, raw.domainIds, raw.domain_ids),
    goalType: String(raw.goalType || raw.goal_type || "task_graph").trim() || "task_graph",
    status: String(raw.status || "active").trim() || "active",
    tags: stringArray(raw.tags),
    tasks: (Array.isArray(raw.tasks) ? raw.tasks : []).map(normalizeOutcomeTask),
    createdAt: raw.createdAt || raw.created_at || now,
    updatedAt: raw.updatedAt || raw.updated_at || now
  };
}

function normalizeOutcomesState(raw = {}) {
  const state = raw && typeof raw === "object" ? raw : {};
  const projects = Array.isArray(state.projects) ? state.projects : Array.isArray(state.items) ? state.items : [];
  return {
    projects: projects.map(normalizeOutcomeProject)
  };
}

async function readOutcomes() {
  const parsed = await readJsonFile(OUTCOMES_FILE, { projects: [] });
  return normalizeOutcomesState(parsed);
}

async function writeOutcomes(state) {
  const normalized = normalizeOutcomesState(state);
  await writeJsonFile(OUTCOMES_FILE, normalized);
  return normalized;
}

const TWIN_STATUSES = new Set(["draft", "review", "approved", "needs_source", "disputed", "active", "archived"]);

function normalizeTwinObjectList(value) {
  return Array.isArray(value) ? value.filter(item => item && typeof item === "object") : [];
}

function normalizeTwinRealities(raw = {}) {
  const realities = raw && typeof raw === "object" ? raw : {};
  return {
    physical: {
      zones: normalizeTwinObjectList(realities.physical?.zones || realities.zones),
      routes: normalizeTwinObjectList(realities.physical?.routes || realities.routes),
      fixtures: normalizeTwinObjectList(realities.physical?.fixtures || realities.fixtures)
    },
    hardware: {
      robots: normalizeTwinObjectList(realities.hardware?.robots || realities.robots),
      devices: normalizeTwinObjectList(realities.hardware?.devices || realities.devices),
      fixtures: normalizeTwinObjectList(realities.hardware?.fixtures || realities.hardwareFixtures)
    },
    software: {
      services: normalizeTwinObjectList(realities.software?.services || realities.services),
      apis: normalizeTwinObjectList(realities.software?.apis || realities.apis),
      queues: normalizeTwinObjectList(realities.software?.queues || realities.queues),
      permissions: normalizeTwinObjectList(realities.software?.permissions || realities.permissions)
    },
    social: {
      roles: normalizeTwinObjectList(realities.social?.roles || realities.roles),
      authority: normalizeTwinObjectList(realities.social?.authority || realities.authority),
      policies: normalizeTwinObjectList(realities.social?.policies || realities.policies),
      workflows: normalizeTwinObjectList(realities.social?.workflows || realities.workflows)
    },
    runtime: {
      activeTasks: normalizeTwinObjectList(realities.runtime?.activeTasks || realities.activeTasks),
      alerts: normalizeTwinObjectList(realities.runtime?.alerts || realities.alerts),
      telemetry: normalizeTwinObjectList(realities.runtime?.telemetry || realities.telemetry)
    }
  };
}

function buildRobodexContract(raw = {}, twin = {}) {
  const contract = raw && typeof raw === "object" ? raw : {};
  const realities = twin.realities || normalizeTwinRealities(twin);
  const siteId = twin.siteId || contract.site_id || contract.siteId || "site";
  const siteType = twin.siteType || contract.site_type || contract.siteType || "operational_site";
  const zones = realities.physical.zones.map(zone => ({
    id: String(zone.id || zone.name || slug(zone.class || "zone")),
    class: String(zone.class || zone.type || "zone"),
    center_m: Array.isArray(zone.center_m) ? zone.center_m : Array.isArray(zone.centerM) ? zone.centerM : undefined,
    policy_tags: stringArray(zone.policy_tags, zone.policyTags, zone.tags)
  })).map(compactObject);
  const robots = realities.hardware.robots.map(robot => ({
    id: String(robot.id || robot.name || slug(robot.class || "robot")),
    class: String(robot.class || robot.type || "mobile_robot"),
    capabilities: stringArray(robot.capabilities, robot.capability)
  }));
  const devices = realities.hardware.devices.map(device => ({
    id: String(device.id || device.name || slug(device.class || "device")),
    class: String(device.class || device.type || "device"),
    capabilities: stringArray(device.capabilities, device.capability)
  })).map(compactObject);
  const fixtures = [...realities.physical.fixtures, ...realities.hardware.fixtures].map(fixture => ({
    id: String(fixture.id || fixture.name || slug(fixture.class || "fixture")),
    class: String(fixture.class || fixture.type || "fixture"),
    zone: fixture.zone || fixture.zoneId || fixture.zone_id
  })).map(compactObject);
  const workflows = realities.social.workflows;
  const functions = normalizeTwinObjectList(contract.functions || contract.forgeRequest?.functions).length
    ? normalizeTwinObjectList(contract.functions || contract.forgeRequest?.functions)
    : workflows.map(workflow => compactObject({
        verb: workflow.verb || workflow.action || "NAVIGATE_TO",
        archetype: workflow.archetype || "navigate_to",
        params: workflow.params || compactObject({
          target_zone: workflow.targetZone || workflow.target_zone || zones[0]?.id,
          operator_role: workflow.operatorRole || workflow.operator_role || "operator"
        })
      }));
  const forgeFunctions = functions.length ? functions : [{
    verb: "NAVIGATE_TO",
    archetype: "navigate_to",
    params: { target_zone: zones[0]?.id || "primary_work_zone", operator_role: "operator" }
  }];

  return {
    hardwareSpec: {
      schema_version: "HardwareSpec.v1",
      site_id: siteId,
      robots,
      devices,
      fixtures
    },
    worldModel: {
      schema_version: "WorldModel.v1",
      site: {
        site_id: siteId,
        site_type: siteType,
        coordinate_frame: contract.coordinate_frame || contract.coordinateFrame || "local_m"
      },
      zones,
      routes: realities.physical.routes,
      base_policies: realities.social.policies
    },
    forgeRequest: {
      schema_version: "CartridgeForgeRequest.v1",
      site_id: siteId,
      functions: forgeFunctions
    }
  };
}

function buildIsaacSimContract(raw = {}) {
  const contract = raw && typeof raw === "object" ? raw : {};
  const fileGroups = Array.isArray(contract.fileGroups) ? contract.fileGroups : [
    {
      id: "core_scene",
      label: "Core scene and control",
      required: true,
      extensions: [".usd", ".usda", ".usdc", ".py"],
      purpose: "Scene, robot, asset description, control scripts, reinforcement learning logic, and automation."
    },
    {
      id: "robot_kinematics",
      label: "Robot and kinematic descriptions",
      required: true,
      extensions: [".urdf", ".mjcf", ".yaml"],
      purpose: "Robot model import, articulation/biomechanics models, ROS bridge, sensor, and camera configuration."
    },
    {
      id: "mesh_cad",
      label: "3D meshes and CAD imports",
      required: false,
      extensions: [".fbx", ".obj", ".gltf", ".glb", ".stl"],
      purpose: "Animated assets, static props, efficient scene assets, and CAD/collision geometry."
    },
    {
      id: "visual_physics_surfaces",
      label: "Visuals and physics surfaces",
      required: false,
      extensions: [".mdl", ".png", ".jpg", ".dds", ".vdb"],
      purpose: "Materials, surface/friction definitions, textures, GPU texture assets, and volumetric effects."
    },
    {
      id: "launch_system",
      label: "Launch and system scripts",
      required: false,
      extensions: [".sh", ".bat"],
      purpose: "Linux/headless launches, Windows startup scripts, and environment setup."
    }
  ];
  return {
    schema_version: "IsaacSimSimulationContract.v1",
    status: contract.status || "operator_supplied",
    provenance: compactObject({
      origin: contract.provenance?.origin || "operator_note",
      verification: contract.provenance?.verification || "not_independently_verified"
    }),
    fileGroups,
    setupQuestions: Array.isArray(contract.setupQuestions) ? contract.setupQuestions : [
      "What type of robot is being simulated?",
      "Which tool produced the original robot model?",
      "Is ROS or ROS 2 connected to the simulation?"
    ],
    artifacts: Array.isArray(contract.artifacts) ? contract.artifacts : []
  };
}

function normalizeOperationalTwin(raw = {}) {
  const now = new Date().toISOString();
  const siteId = String(raw.siteId || raw.site_id || raw.site?.site_id || slug(raw.name || "site")).trim();
  const siteType = String(raw.siteType || raw.site_type || raw.site?.site_type || "operational_site").trim();
  const realities = normalizeTwinRealities(raw.realities || raw);
  const status = String(raw.status || "draft").trim().toLowerCase().replace(/\s+/g, "_");
  const twin = {
    ...raw,
    id: String(raw.id || `twin-${slug(siteId || raw.name || "site")}`),
    name: String(raw.name || raw.title || siteId || "Operational Twin").trim(),
    siteId,
    siteType,
    status: TWIN_STATUSES.has(status) ? status : "draft",
    domains: stringArray(raw.domains, raw.domain),
    tags: stringArray(raw.tags),
    sourceIds: stringArray(raw.sourceIds, raw.source_ids),
    claimIds: stringArray(raw.claimIds, raw.claim_ids),
    questionIds: stringArray(raw.questionIds, raw.question_ids),
    outcomeProjectIds: stringArray(raw.outcomeProjectIds, raw.outcome_project_ids),
    provenance: compactObject(raw.provenance || {}),
    realities,
    contracts: {
      ...(raw.contracts && typeof raw.contracts === "object" ? raw.contracts : {}),
      robodex: buildRobodexContract(raw.contracts?.robodex || raw.robodex || {}, { ...raw, siteId, siteType, realities }),
      isaacSim: buildIsaacSimContract(raw.contracts?.isaacSim || raw.isaacSim || {})
    },
    createdAt: raw.createdAt || raw.created_at || now,
    updatedAt: raw.updatedAt || raw.updated_at || now
  };
  return twin;
}

function normalizeOperationalTwinsState(raw = {}) {
  const state = raw && typeof raw === "object" ? raw : {};
  const twins = Array.isArray(state.twins) ? state.twins : Array.isArray(state.items) ? state.items : [];
  return { twins: twins.map(normalizeOperationalTwin) };
}

async function readOperationalTwins() {
  const parsed = await readJsonFile(OPERATIONAL_TWINS_FILE, { twins: [] });
  return normalizeOperationalTwinsState(parsed);
}

async function writeOperationalTwins(state) {
  const normalized = normalizeOperationalTwinsState(state);
  await writeJsonFile(OPERATIONAL_TWINS_FILE, normalized);
  return normalized;
}

const MISSION_PHASES = [
  "intake", "diverging", "emerging", "converging", "review_waiting",
  "outcome_compiling", "twin_projecting", "execution_packaging", "blocked", "completed"
];

const DEFAULT_AGENT_REGISTRY = [
  {
    id: "intake_normalizer",
    label: "Use Case Intake Agent",
    phase: "intake",
    inputArtifactTypes: [],
    outputArtifactTypes: ["use_case_packet"],
    allowedTools: ["local_state"],
    policy: { autoRunAllowed: true, approvalRequired: false }
  },
  {
    id: "question_decomposer",
    label: "Question Decomposer Agent",
    phase: "diverging",
    inputArtifactTypes: ["use_case_packet"],
    outputArtifactTypes: ["research_question"],
    allowedTools: ["local_state"],
    policy: { autoRunAllowed: true, approvalRequired: false }
  },
  {
    id: "source_scout_local_files",
    label: "Local File Scout Agent",
    phase: "diverging",
    inputArtifactTypes: ["research_question"],
    outputArtifactTypes: ["source_packet"],
    allowedTools: ["workspace_files"],
    policy: { autoRunAllowed: true, approvalRequired: false, provenance: "operator_document" }
  },
  {
    id: "claim_extractor",
    label: "Claim Extraction Agent",
    phase: "emerging",
    inputArtifactTypes: ["source_packet"],
    outputArtifactTypes: ["claim_packet"],
    allowedTools: ["artifact_bus"],
    policy: { autoRunAllowed: true, approvalRequired: true, defaultReviewStatus: "needs_review" }
  },
  {
    id: "concept_clusterer",
    label: "Emergence Agent",
    phase: "emerging",
    inputArtifactTypes: ["claim_packet", "research_question"],
    outputArtifactTypes: ["concept_cluster"],
    allowedTools: ["artifact_bus"],
    policy: { autoRunAllowed: true, approvalRequired: false }
  },
  {
    id: "convergence_planner",
    label: "Convergence Planner Agent",
    phase: "converging",
    inputArtifactTypes: ["concept_cluster"],
    outputArtifactTypes: ["decision_candidate", "blocker"],
    allowedTools: ["artifact_bus"],
    policy: { autoRunAllowed: true, approvalRequired: true }
  },
  {
    id: "outcome_compiler",
    label: "Outcome Compiler Agent",
    phase: "outcome_compiling",
    inputArtifactTypes: ["decision_candidate", "research_question", "blocker"],
    outputArtifactTypes: ["outcome_task_candidate"],
    allowedTools: ["outcomes"],
    policy: { autoRunAllowed: true, approvalRequired: true }
  },
  {
    id: "twin_projector",
    label: "Twin Projection Agent",
    phase: "twin_projecting",
    inputArtifactTypes: ["decision_candidate", "outcome_task_candidate"],
    outputArtifactTypes: ["twin_delta_candidate"],
    allowedTools: ["operational_twins"],
    policy: { autoRunAllowed: true, approvalRequired: true, approvedInputsOnly: true }
  },
  {
    id: "execution_pack_compiler",
    label: "Execution Pack Compiler Agent",
    phase: "execution_packaging",
    inputArtifactTypes: ["twin_delta_candidate"],
    outputArtifactTypes: ["execution_pack_candidate", "blocker"],
    allowedTools: ["robodex_contract", "isaac_sim_contract"],
    policy: { autoRunAllowed: true, approvalRequired: true, refuseOnDisputedInputs: true }
  },
  {
    id: "mission_controller",
    label: "Mission Control Agent",
    phase: "converging",
    inputArtifactTypes: ["*"],
    outputArtifactTypes: ["mission_event"],
    allowedTools: ["mission_state"],
    policy: { autoRunAllowed: true, approvalRequired: false }
  }
];

const LOCAL_MISSION_FILES = [
  "argos-research-spec.html",
  "ens-navigator-spec.html",
  "operational-twin-input-contract.html",
  "operational_twin_substrate_spec.html",
  "irftek_complete_substrate_architecture.html",
  "SPEC_irftek-production.html",
  "irftek_spec.html",
  "LOCAL_API.md",
  "index.html",
  "server.mjs",
  "mcp-server.mjs",
  "scripts/ingest-local-files.mjs"
];

function emptyMissionState() {
  return { missions: [] };
}

function normalizeMissionPolicy(raw = {}) {
  return {
    mode: raw.mode || "manual_step",
    allowAutoIngestSources: raw.allowAutoIngestSources !== false,
    allowAutoGenerateOutcomes: raw.allowAutoGenerateOutcomes !== false,
    allowAutoProjectTwin: raw.allowAutoProjectTwin !== false,
    requireApprovalForCanon: raw.requireApprovalForCanon !== false,
    requireApprovalForExecution: raw.requireApprovalForExecution !== false,
    sourcePolicy: raw.sourcePolicy || "public_or_operator_sources",
    maxSteps: Math.max(1, Math.min(50, num(raw.maxSteps, 12)))
  };
}

function normalizeMission(raw = {}, artifacts = []) {
  const now = new Date().toISOString();
  const useCase = String(raw.useCase || raw.use_case || raw.goal || raw.title || "").trim();
  const id = String(raw.id || `mission-${slug(useCase || "use-case")}-${Math.random().toString(36).slice(2, 7)}`).slice(0, 120);
  const missionArtifacts = artifacts.filter(a => a.missionId === id);
  return {
    ...raw,
    id,
    title: String(raw.title || useCase || "Untitled mission").trim(),
    useCase,
    status: MISSION_PHASES.includes(raw.status) ? raw.status : deriveMissionPhase({ ...raw, id }, missionArtifacts),
    objective: raw.objective || "",
    policy: normalizeMissionPolicy(raw.policy || {}),
    active: raw.active !== false,
    parentMissionId: raw.parentMissionId || raw.parent_mission_id || "",
    branchOf: raw.branchOf || raw.branch_of || "",
    mergedInto: raw.mergedInto || raw.merged_into || "",
    tags: stringArray(raw.tags),
    createdAt: raw.createdAt || raw.created_at || now,
    updatedAt: raw.updatedAt || raw.updated_at || now
  };
}

function normalizeAgent(raw = {}) {
  return {
    id: String(raw.id || slug(raw.label || "agent")),
    label: String(raw.label || raw.id || "Agent").trim(),
    phase: raw.phase || "diverging",
    inputArtifactTypes: stringArray(raw.inputArtifactTypes || raw.input_artifact_types),
    outputArtifactTypes: stringArray(raw.outputArtifactTypes || raw.output_artifact_types),
    allowedTools: stringArray(raw.allowedTools || raw.allowed_tools),
    policy: raw.policy && typeof raw.policy === "object" ? raw.policy : {},
    promptTemplate: raw.promptTemplate || raw.prompt_template || "",
    outputSchema: raw.outputSchema || raw.output_schema || {}
  };
}

function normalizeArtifact(raw = {}) {
  const now = new Date().toISOString();
  const type = String(raw.type || "mission_event").trim();
  return {
    ...raw,
    id: String(raw.id || `artifact-${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`),
    missionId: String(raw.missionId || raw.mission_id || ""),
    type,
    status: String(raw.status || "active").trim(),
    payload: raw.payload && typeof raw.payload === "object" ? raw.payload : {},
    sourceIds: stringArray(raw.sourceIds, raw.source_ids),
    claimIds: stringArray(raw.claimIds, raw.claim_ids),
    parentArtifactIds: stringArray(raw.parentArtifactIds, raw.parent_artifact_ids),
    agentRunId: raw.agentRunId || raw.agent_run_id || "",
    confidence: raw.confidence == null ? null : Number(raw.confidence),
    reviewStatus: raw.reviewStatus || raw.review_status || (["claim_packet", "decision_candidate", "outcome_task_candidate", "twin_delta_candidate", "execution_pack_candidate"].includes(type) ? "needs_review" : "not_required"),
    createdAt: raw.createdAt || raw.created_at || now,
    updatedAt: raw.updatedAt || raw.updated_at || now
  };
}

function normalizeArtifactLink(raw = {}) {
  return {
    id: String(raw.id || `alink-${raw.fromArtifactId || raw.from}-${raw.toArtifactId || raw.to}-${raw.type || "derived_from"}`).slice(0, 180),
    missionId: String(raw.missionId || raw.mission_id || ""),
    fromArtifactId: String(raw.fromArtifactId || raw.from_artifact_id || raw.from || ""),
    toArtifactId: String(raw.toArtifactId || raw.to_artifact_id || raw.to || ""),
    type: String(raw.type || raw.relation || "derived_from"),
    createdAt: raw.createdAt || raw.created_at || new Date().toISOString()
  };
}

function normalizeMissionAgentRun(raw = {}) {
  const now = new Date().toISOString();
  return {
    id: String(raw.id || `arun-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`),
    missionId: String(raw.missionId || raw.mission_id || ""),
    agentId: String(raw.agentId || raw.agent_id || ""),
    status: String(raw.status || "completed"),
    inputArtifactIds: stringArray(raw.inputArtifactIds, raw.input_artifact_ids),
    outputArtifactIds: stringArray(raw.outputArtifactIds, raw.output_artifact_ids),
    error: raw.error || "",
    startedAt: raw.startedAt || raw.started_at || now,
    completedAt: raw.completedAt || raw.completed_at || now,
    createdAt: raw.createdAt || raw.created_at || now
  };
}

function normalizeReview(raw = {}) {
  const now = new Date().toISOString();
  return {
    id: String(raw.id || `review-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`),
    missionId: String(raw.missionId || raw.mission_id || ""),
    artifactId: String(raw.artifactId || raw.artifact_id || ""),
    decision: String(raw.decision || raw.status || "needs_review"),
    note: raw.note || raw.reason || "",
    reviewer: raw.reviewer || "operator",
    createdAt: raw.createdAt || raw.created_at || now
  };
}

function normalizePolicyState(raw = {}) {
  return {
    policies: Array.isArray(raw.policies) ? raw.policies : [
      { id: "no_sourceless_canon", label: "No sourceless canon", enabled: true },
      { id: "operator_approval_for_execution", label: "Operator approval for execution", enabled: true },
      { id: "operator_docs_are_not_external_evidence", label: "Operator docs are not external evidence", enabled: true }
    ]
  };
}

function artifactCounts(artifacts = []) {
  return artifacts.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});
}

function deriveMissionPhase(mission, artifacts = []) {
  const counts = artifactCounts(artifacts);
  const openBlockers = artifacts.filter(a => a.type === "blocker" && !["resolved", "approved"].includes(a.reviewStatus)).length;
  const reviewWaiting = artifacts.filter(a => ["needs_review", "needs_source", "disputed"].includes(a.reviewStatus)).length;
  if (openBlockers) return "blocked";
  if (!counts.use_case_packet) return "intake";
  if (!counts.source_packet || !counts.research_question) return "diverging";
  if (!counts.concept_cluster) return "emerging";
  if (!counts.decision_candidate) return "converging";
  if (reviewWaiting) return "review_waiting";
  if (!counts.outcome_task_candidate) return "outcome_compiling";
  if (!counts.twin_delta_candidate) return "twin_projecting";
  if (!counts.execution_pack_candidate) return "execution_packaging";
  return "completed";
}

async function readMissions() {
  const artifacts = await readArtifacts();
  const parsed = await readJsonFile(MISSIONS_FILE, emptyMissionState());
  const missions = Array.isArray(parsed.missions) ? parsed.missions : Array.isArray(parsed) ? parsed : [];
  return { missions: missions.map(m => normalizeMission(m, artifacts.artifacts)) };
}

async function writeMissions(state) {
  const artifacts = await readArtifacts();
  const missions = (Array.isArray(state?.missions) ? state.missions : []).map(m => normalizeMission(m, artifacts.artifacts));
  await writeJsonFile(MISSIONS_FILE, { missions });
  return { missions };
}

async function readAgentRegistry() {
  const parsed = await readJsonFile(AGENT_REGISTRY_FILE, { agents: DEFAULT_AGENT_REGISTRY });
  const agents = Array.isArray(parsed.agents) ? parsed.agents : DEFAULT_AGENT_REGISTRY;
  return { agents: agents.map(normalizeAgent) };
}

async function writeAgentRegistry(state) {
  const agents = (Array.isArray(state?.agents) ? state.agents : DEFAULT_AGENT_REGISTRY).map(normalizeAgent);
  await writeJsonFile(AGENT_REGISTRY_FILE, { agents });
  return { agents };
}

async function readArtifacts() {
  const parsed = await readJsonFile(ARTIFACTS_FILE, { artifacts: [] });
  return { artifacts: (Array.isArray(parsed.artifacts) ? parsed.artifacts : []).map(normalizeArtifact) };
}

async function writeArtifacts(state) {
  const artifacts = (Array.isArray(state?.artifacts) ? state.artifacts : []).map(normalizeArtifact);
  await writeJsonFile(ARTIFACTS_FILE, { artifacts });
  return { artifacts };
}

async function readArtifactLinks() {
  const parsed = await readJsonFile(ARTIFACT_LINKS_FILE, { links: [] });
  return { links: (Array.isArray(parsed.links) ? parsed.links : []).map(normalizeArtifactLink) };
}

async function writeArtifactLinks(state) {
  const links = (Array.isArray(state?.links) ? state.links : []).map(normalizeArtifactLink);
  await writeJsonFile(ARTIFACT_LINKS_FILE, { links });
  return { links };
}

async function readAgentRuns() {
  const parsed = await readJsonFile(AGENT_RUNS_FILE, { runs: [] });
  return { runs: (Array.isArray(parsed.runs) ? parsed.runs : []).map(normalizeMissionAgentRun) };
}

async function writeAgentRuns(state) {
  const runs = (Array.isArray(state?.runs) ? state.runs : []).map(normalizeMissionAgentRun);
  await writeJsonFile(AGENT_RUNS_FILE, { runs });
  return { runs };
}

async function readReviews() {
  const parsed = await readJsonFile(REVIEWS_FILE, { reviews: [] });
  return { reviews: (Array.isArray(parsed.reviews) ? parsed.reviews : []).map(normalizeReview) };
}

async function writeReviews(state) {
  const reviews = (Array.isArray(state?.reviews) ? state.reviews : []).map(normalizeReview);
  await writeJsonFile(REVIEWS_FILE, { reviews });
  return { reviews };
}

async function readPolicies() {
  return normalizePolicyState(await readJsonFile(POLICIES_FILE, normalizePolicyState()));
}

async function createMission(body = {}) {
  const current = await readMissions();
  const mission = normalizeMission({
    title: body.title || body.name || body.useCase || body.goal,
    useCase: body.useCase || body.use_case || body.goal || body.title || "",
    objective: body.objective || "",
    policy: body.policy || {},
    tags: body.tags || []
  });
  const missions = current.missions.map(m => ({ ...m, active: false }));
  missions.unshift(mission);
  await writeMissions({ missions });
  return mission;
}

async function addArtifacts(missionId, agentRunId, outputs = [], parentArtifactIds = []) {
  const state = await readArtifacts();
  const linksState = await readArtifactLinks();
  const artifacts = outputs.map(raw => normalizeArtifact({
    ...raw,
    missionId,
    agentRunId,
    parentArtifactIds: stringArray(raw.parentArtifactIds, parentArtifactIds)
  }));
  const links = [];
  for (const artifact of artifacts) {
    for (const parentId of artifact.parentArtifactIds) {
      links.push(normalizeArtifactLink({
        missionId,
        fromArtifactId: parentId,
        toArtifactId: artifact.id,
        type: "derived_from"
      }));
    }
  }
  await writeArtifacts({ artifacts: [...artifacts, ...state.artifacts] });
  await writeArtifactLinks({ links: [...links, ...linksState.links] });
  return artifacts;
}

function missionArtifacts(artifacts, missionId) {
  return artifacts.filter(a => a.missionId === missionId);
}

function artifactsByType(artifacts, type) {
  return artifacts.filter(a => a.type === type);
}

function classifyUseCase(text) {
  const value = tagOf(text);
  const domains = [];
  if (/(robot|robodex|isaac|simulation|warehouse|amr|drone)/.test(value)) domains.push("robotics simulation");
  if (/(football|mesh|p2p|local first|gossip|crdt)/.test(value)) domains.push("local-first social mesh");
  if (/(expert|scientist|biotech|neuro|nano|ai)/.test(value)) domains.push("expert discovery");
  if (!domains.length) domains.push("general research");
  const target = domains.includes("robotics simulation") ? "execution_pack" : domains.includes("expert discovery") ? "expert_pipeline" : "domain_knowledge";
  const risk = /(execute|robot|hardware|medical|legal|financial|safety)/.test(value) ? "high" : "medium";
  return { domains, target, risk };
}

function decomposedQuestions(useCase, classification) {
  const base = [
    `What source-backed facts are required to answer: ${useCase}?`,
    "Which assumptions are operator-provided rather than externally sourced?",
    "What contradictions or missing sources would block promotion to canon?",
    "What outcome tasks are needed after the evidence pass?"
  ];
  if (classification.target === "execution_pack") {
    base.push("What operational twin facts are needed before execution packaging?");
    base.push("Which Robodex or Isaac Sim artifacts are missing?");
  }
  if (classification.target === "expert_pipeline") {
    base.push("Which experts or institutions can validate the claims?");
    base.push("Which contact/compliance boundaries apply?");
  }
  return base;
}

function localSourcePacketsForMission(mission) {
  const use = tagOf(mission.useCase);
  return LOCAL_MISSION_FILES
    .filter(file => existsSync(join(ROOT, file)))
    .filter(file => {
      const f = tagOf(file);
      if (!use) return true;
      if (/(robot|isaac|simulation|warehouse|amr|robodex|irftek)/.test(use)) return /(irftek|robodex|operational|twin|isaac|server|local_api|ens)/.test(f);
      if (/(argos|memory)/.test(use)) return /(argos|ens|local_api|server)/.test(f);
      if (/(expert|biotech|scientist)/.test(use)) return /(seed|biotech|scientist|ens|server|mcp)/.test(f);
      return true;
    })
    .slice(0, 10)
    .map(file => ({
      type: "source_packet",
      status: "active",
      reviewStatus: "not_required",
      confidence: 1,
      payload: {
        title: file,
        sourceType: "operator_document",
        locator: `local://${file.replace(/\\/g, "/")}`,
        summary: `Local workspace file selected by source_scout_local_files for mission ${mission.id}.`,
        provenance: { origin: "operator_document", path: file.replace(/\\/g, "/") }
      },
      sourceIds: [`src-local-${slug(file)}`]
    }));
}

function chooseNextAgent(mission, artifacts) {
  const counts = artifactCounts(artifacts);
  if (!counts.use_case_packet) return "intake_normalizer";
  if (!counts.research_question) return "question_decomposer";
  if (!counts.source_packet) return "source_scout_local_files";
  if (!counts.claim_packet) return "claim_extractor";
  if (!counts.concept_cluster) return "concept_clusterer";
  if (!counts.decision_candidate) return "convergence_planner";
  if (!counts.outcome_task_candidate) return "outcome_compiler";
  if (!counts.twin_delta_candidate) return "twin_projector";
  if (!counts.execution_pack_candidate) return "execution_pack_compiler";
  return "mission_controller";
}

async function runDeterministicAgent(mission, agentId, artifacts) {
  const parentIds = artifacts.slice(0, 12).map(a => a.id);
  const usePacket = artifactsByType(artifacts, "use_case_packet")[0];
  const classification = usePacket?.payload?.classification || classifyUseCase(mission.useCase);
  if (agentId === "intake_normalizer") {
    return [{
      type: "use_case_packet",
      reviewStatus: "not_required",
      payload: {
        useCase: mission.useCase,
        normalizedGoal: mission.useCase,
        classification: classifyUseCase(mission.useCase),
        requiredEvidence: "source-backed claims; operator documents separated from external research",
        targetArtifact: classifyUseCase(mission.useCase).target
      }
    }];
  }
  if (agentId === "question_decomposer") {
    return decomposedQuestions(mission.useCase, classification).map((question, index) => ({
      type: "research_question",
      reviewStatus: "not_required",
      confidence: 0.8,
      payload: {
        question,
        lane: index < 4 ? "research" : classification.target,
        priority: index < 3 ? 5 : 4
      },
      parentArtifactIds: [usePacket?.id].filter(Boolean)
    }));
  }
  if (agentId === "source_scout_local_files") {
    return localSourcePacketsForMission(mission);
  }
  if (agentId === "claim_extractor") {
    return artifactsByType(artifacts, "source_packet").slice(0, 10).map(source => ({
      type: "claim_packet",
      reviewStatus: "needs_review",
      confidence: 0.55,
      sourceIds: source.sourceIds,
      parentArtifactIds: [source.id],
      payload: {
        claim: `${source.payload.title} is a relevant operator-provided source artifact for this mission.`,
        caveat: "Operator document inventory claim; not external research or canon until reviewed.",
        sourceLocator: source.payload.locator,
        evidenceType: source.payload.sourceType
      }
    }));
  }
  if (agentId === "concept_clusterer") {
    const claims = artifactsByType(artifacts, "claim_packet");
    const questions = artifactsByType(artifacts, "research_question");
    return [{
      type: "concept_cluster",
      reviewStatus: "not_required",
      confidence: 0.65,
      parentArtifactIds: [...claims.slice(0, 8), ...questions.slice(0, 4)].map(a => a.id),
      payload: {
        title: `${classification.domains.join(" + ")} mission cluster`,
        concepts: classification.domains,
        patterns: [
          "source inventory must be separated from approved canon",
          "operator review is required before promotion",
          classification.target === "execution_pack" ? "execution packs must be generated from accepted twin state" : "domain knowledge should drive outcomes"
        ],
        openQuestions: questions.map(q => q.payload.question).slice(0, 6)
      }
    }];
  }
  if (agentId === "convergence_planner") {
    const clusters = artifactsByType(artifacts, "concept_cluster");
    const claimNeedsReview = artifactsByType(artifacts, "claim_packet").filter(a => a.reviewStatus === "needs_review").length;
    return [{
      type: "decision_candidate",
      reviewStatus: "needs_review",
      confidence: 0.7,
      parentArtifactIds: clusters.map(a => a.id),
      payload: {
        decision: claimNeedsReview ? "review_claim_packets_before_promotion" : "promote_cluster_to_outcomes",
        rationale: claimNeedsReview
          ? `${claimNeedsReview} extracted claim packets require operator review before canon or execution use.`
          : "No open claim review blockers detected.",
        nextAgent: claimNeedsReview ? "operator_review" : "outcome_compiler"
      }
    }];
  }
  if (agentId === "outcome_compiler") {
    const questions = artifactsByType(artifacts, "research_question");
    return questions.slice(0, 8).map((q, index) => ({
      type: "outcome_task_candidate",
      reviewStatus: "needs_review",
      confidence: 0.68,
      parentArtifactIds: [q.id],
      payload: {
        title: `Resolve: ${q.payload.question}`,
        detail: "Generated from mission question; attach source-backed claims before marking done.",
        priority: index < 3 ? 5 : 4,
        status: "backlog",
        evidenceGate: "requires approved claim or source"
      }
    }));
  }
  if (agentId === "twin_projector") {
    return [{
      type: "twin_delta_candidate",
      reviewStatus: "needs_review",
      confidence: 0.5,
      parentArtifactIds: artifactsByType(artifacts, "decision_candidate").map(a => a.id),
      payload: {
        twinId: `twin-${slug(classification.domains[0] || mission.title)}`,
        status: "draft",
        proposedRealities: {
          physical: [],
          hardware: [],
          software: [{ id: "mission_pipeline_agent", class: "research_orchestrator" }],
          social: [{ id: "operator_approval", class: "approval_policy" }]
        },
        refusalBoundary: "Do not promote to accepted twin without reviewed claim packets and operator-approved site facts."
      }
    }];
  }
  if (agentId === "execution_pack_compiler") {
    const twinDeltas = artifactsByType(artifacts, "twin_delta_candidate");
    return [{
      type: "execution_pack_candidate",
      reviewStatus: "needs_review",
      confidence: 0.45,
      parentArtifactIds: twinDeltas.map(a => a.id),
      payload: {
        status: "draft",
        robodex: { ready: false, reason: "Requires approved operational twin state." },
        isaacSim: { ready: false, reason: "Requires concrete robot/site artifact files." },
        missing: ["approved twin", "site facts", "execution approval"]
      }
    }];
  }
  return [{
    type: "mission_event",
    reviewStatus: "not_required",
    payload: {
      event: "mission_step_complete",
      phase: deriveMissionPhase(mission, artifacts),
      counts: artifactCounts(artifacts)
    }
  }];
}

async function stepMission(missionId, options = {}) {
  const missionState = await readMissions();
  const mission = missionState.missions.find(m => m.id === missionId);
  if (!mission) return null;
  const artifactState = await readArtifacts();
  const currentArtifacts = missionArtifacts(artifactState.artifacts, mission.id);
  const agentId = options.agentId || options.agent_id || chooseNextAgent(mission, currentArtifacts);
  const agentRun = normalizeMissionAgentRun({ missionId: mission.id, agentId, status: "running", inputArtifactIds: currentArtifacts.slice(0, 20).map(a => a.id), startedAt: new Date().toISOString() });
  let outputs = [];
  try {
    outputs = await runDeterministicAgent(mission, agentId, currentArtifacts);
    const stored = await addArtifacts(mission.id, agentRun.id, outputs, []);
    agentRun.status = "completed";
    agentRun.outputArtifactIds = stored.map(a => a.id);
    agentRun.completedAt = new Date().toISOString();
  } catch (error) {
    agentRun.status = "failed";
    agentRun.error = error.message || String(error);
    agentRun.completedAt = new Date().toISOString();
  }
  const runs = await readAgentRuns();
  await writeAgentRuns({ runs: [agentRun, ...runs.runs] });
  const updatedArtifactState = await readArtifacts();
  const updatedArtifacts = missionArtifacts(updatedArtifactState.artifacts, mission.id);
  const nextMission = normalizeMission({ ...mission, status: deriveMissionPhase(mission, updatedArtifacts), updatedAt: new Date().toISOString() }, updatedArtifacts);
  await writeMissions({ missions: missionState.missions.map(m => m.id === mission.id ? nextMission : m) });
  return { mission: nextMission, agentRun, artifacts: updatedArtifacts, produced: agentRun.outputArtifactIds };
}

async function branchMission(missionId, body = {}) {
  const missions = await readMissions();
  const source = missions.missions.find(m => m.id === missionId);
  if (!source) return null;
  const branch = normalizeMission({
    ...source,
    id: `mission-${slug(body.title || source.title)}-branch-${Math.random().toString(36).slice(2, 7)}`,
    title: body.title || `${source.title} branch`,
    parentMissionId: source.id,
    branchOf: source.id,
    status: "intake",
    active: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  await writeMissions({ missions: [branch, ...missions.missions.map(m => ({ ...m, active: false }))] });
  return branch;
}

async function mergeMission(missionId, body = {}) {
  const missions = await readMissions();
  const targetId = body.targetMissionId || body.target_mission_id || missions.missions.find(m => !m.branchOf && m.id !== missionId)?.id || "";
  const next = missions.missions.map(m => m.id === missionId ? { ...m, mergedInto: targetId, active: false, status: "completed", updatedAt: new Date().toISOString() } : m);
  await writeMissions({ missions: next });
  return next.find(m => m.id === missionId);
}

async function createReview(body = {}) {
  const review = normalizeReview(body);
  const reviews = await readReviews();
  await writeReviews({ reviews: [review, ...reviews.reviews] });
  const artifactState = await readArtifacts();
  const artifacts = artifactState.artifacts.map(a => a.id === review.artifactId
    ? { ...a, reviewStatus: review.decision, updatedAt: new Date().toISOString() }
    : a);
  await writeArtifacts({ artifacts });
  return review;
}

function artifactPromotionTarget(artifact = {}) {
  const type = artifact.type || "";
  if (["source_packet", "claim_packet", "research_question", "decision_candidate", "concept_cluster"].includes(type)) return "domain_knowledge";
  if (type === "outcome_task_candidate") return "outcomes";
  if (type === "twin_delta_candidate") return "twins";
  if (type === "execution_pack_candidate") return "execution_pack";
  return "mission_only";
}

function artifactSourceOrigin(artifact = {}) {
  const payload = artifact.payload || {};
  return String(payload.sourceType || payload.provenance?.origin || payload.origin || "").trim();
}

function statusForPromotedKnowledge(artifact = {}) {
  const origin = artifactSourceOrigin(artifact);
  if (artifact.reviewStatus === "disputed") return "disputed";
  if (artifact.reviewStatus === "needs_source") return "needs_source";
  if (artifact.reviewStatus === "approved" && /research|journal|paper|standard|official|external/i.test(origin)) return "approved";
  if (artifact.type === "source_packet") return "needs_review";
  return "needs_source";
}

function domainKnowledgePayloadFromArtifact(artifact = {}, mission = {}) {
  const payload = artifact.payload || {};
  const domainName = classifyUseCase(mission.useCase || mission.title || "").domains[0] || "mission research";
  const provenance = {
    origin: "mission_artifact",
    missionId: artifact.missionId,
    artifactId: artifact.id,
    artifactType: artifact.type,
    sourceOrigin: artifactSourceOrigin(artifact) || undefined
  };
  const sourceId = artifact.sourceIds?.[0] || `src-${slug(payload.title || payload.locator || artifact.id)}`;
  const common = {
    tags: stringArray(mission.tags, domainName, artifact.type),
    domainIds: [`dom-${slug(domainName)}`],
    provenance
  };
  const result = {
    origin: "mission_artifact",
    aiGenerated: false,
    tags: common.tags,
    domains: [{
      id: common.domainIds[0],
      name: domainName,
      status: "needs_review",
      summary: `Mission-derived domain bucket for ${mission.title || mission.useCase || artifact.missionId}.`,
      provenance
    }],
    sources: [],
    claims: [],
    questions: [],
    links: []
  };

  if (artifact.type === "source_packet") {
    result.sources.push({
      id: sourceId,
      title: payload.title || payload.locator || artifact.id,
      url: payload.locator || payload.url || "",
      type: payload.sourceType || "mission_artifact",
      summary: payload.summary || "",
      status: "needs_review",
      ...common
    });
  }

  if (artifact.type === "claim_packet") {
    const claimId = `claim-${slug(payload.claim || artifact.id)}`;
    result.claims.push({
      id: claimId,
      claim: payload.claim || artifactTitleForServer(artifact),
      text: payload.claim || artifactTitleForServer(artifact),
      caveat: payload.caveat || "Promoted from a mission artifact; requires source review before canon use.",
      status: statusForPromotedKnowledge(artifact),
      confidence: artifact.confidence,
      sourceIds: artifact.sourceIds,
      ...common
    });
    if (payload.sourceLocator || artifact.sourceIds?.length) {
      result.sources.push({
        id: sourceId,
        title: payload.sourceLocator || artifact.sourceIds?.[0] || "Mission source",
        url: payload.sourceLocator || "",
        type: payload.evidenceType || "mission_artifact",
        status: "needs_review",
        ...common
      });
      result.links.push({
        id: `link-${sourceId}-${claimId}`,
        from: sourceId,
        to: claimId,
        type: "supports",
        status: "needs_review",
        provenance
      });
    }
  }

  if (artifact.type === "research_question") {
    result.questions.push({
      id: `q-${slug(payload.question || artifact.id)}`,
      question: payload.question || artifactTitleForServer(artifact),
      text: payload.question || artifactTitleForServer(artifact),
      status: "needs_review",
      priority: payload.priority || 3,
      ...common
    });
  }

  if (artifact.type === "decision_candidate" || artifact.type === "concept_cluster") {
    result.claims.push({
      id: `claim-${slug(payload.decision || payload.title || artifact.id)}`,
      claim: payload.decision || payload.title || artifactTitleForServer(artifact),
      text: payload.rationale || (payload.patterns || []).join("; ") || payload.title || artifactTitleForServer(artifact),
      status: "needs_review",
      confidence: artifact.confidence,
      ...common
    });
  }

  return result;
}

function artifactTitleForServer(artifact = {}) {
  const payload = artifact.payload || {};
  return payload.title || payload.question || payload.claim || payload.decision || payload.event || payload.status || artifact.type || artifact.id;
}

async function promoteArtifact(artifactId, body = {}) {
  const artifactState = await readArtifacts();
  const artifact = artifactState.artifacts.find(a => a.id === artifactId);
  if (!artifact) return null;
  const missionState = await readMissions();
  const mission = missionState.missions.find(m => m.id === artifact.missionId) || {};
  const target = body.target || artifactPromotionTarget(artifact);
  const now = new Date().toISOString();
  const promotion = { target, artifactId, missionId: artifact.missionId, promotedAt: now };
  let result = { ok: true, target, artifact };

  if (target === "domain_knowledge") {
    const payload = domainKnowledgePayloadFromArtifact(artifact, mission);
    const ingested = await ingestDomainKnowledgePayload(payload);
    result = { ...result, summary: ingested.summary };
  } else if (target === "outcomes") {
    const current = await readOutcomes();
    const projectId = `out-mission-${slug(artifact.missionId || mission.title || "mission")}`;
    const payload = artifact.payload || {};
    const task = normalizeOutcomeTask({
      id: `task-${slug(artifact.id)}`,
      title: payload.title || `Review ${humanArtifactType(artifact.type)}`,
      detail: payload.detail || payload.evidenceGate || JSON.stringify(payload).slice(0, 400),
      domain: classifyUseCase(mission.useCase || mission.title || "").domains[0] || "mission",
      status: "backlog",
      priority: payload.priority || 4,
      sourceIds: artifact.sourceIds,
      claimIds: artifact.claimIds,
      questionIds: artifact.parentArtifactIds,
      createdAt: artifact.createdAt,
      updatedAt: now
    });
    const existing = current.projects.find(p => p.id === projectId);
    const project = normalizeOutcomeProject(existing || {
      id: projectId,
      name: `${mission.title || "Mission"} outcomes`,
      domains: [task.domain],
      goalType: "mission_task_graph",
      status: "active",
      tags: stringArray(mission.tags, "mission")
    });
    const taskMap = new Map(project.tasks.map(item => [item.id, item]));
    taskMap.set(task.id, { ...(taskMap.get(task.id) || {}), ...task, updatedAt: now });
    project.tasks = [...taskMap.values()].map(normalizeOutcomeTask);
    project.updatedAt = now;
    const projects = existing
      ? current.projects.map(p => p.id === project.id ? project : p)
      : [project, ...current.projects];
    await writeOutcomes({ projects });
    result = { ...result, projectId: project.id, taskId: task.id };
  } else if (target === "twins") {
    const current = await readOperationalTwins();
    const payload = artifact.payload || {};
    const proposed = payload.proposedRealities || {};
    const twinId = payload.twinId || `twin-${slug(mission.title || artifact.missionId || "mission")}`;
    const existing = current.twins.find(t => t.id === twinId);
    const nextTwin = normalizeOperationalTwin({
      ...(existing || {}),
      id: twinId,
      name: existing?.name || `${mission.title || "Mission"} operational twin`,
      siteId: existing?.siteId || twinId.replace(/^twin-/, ""),
      siteType: existing?.siteType || "mission_operational_site",
      status: artifact.reviewStatus === "approved" ? "review" : "needs_source",
      domains: stringArray(existing?.domains, classifyUseCase(mission.useCase || "").domains),
      tags: stringArray(existing?.tags, mission.tags, "mission_artifact"),
      sourceIds: stringArray(existing?.sourceIds, artifact.sourceIds),
      claimIds: stringArray(existing?.claimIds, artifact.claimIds),
      provenance: {
        ...(existing?.provenance || {}),
        missionId: artifact.missionId,
        artifactId: artifact.id,
        origin: "mission_artifact"
      },
      realities: {
        physical: {
          zones: normalizeTwinObjectList(existing?.realities?.physical?.zones),
          routes: normalizeTwinObjectList(existing?.realities?.physical?.routes),
          fixtures: normalizeTwinObjectList(existing?.realities?.physical?.fixtures)
        },
        hardware: {
          robots: normalizeTwinObjectList(existing?.realities?.hardware?.robots),
          devices: normalizeTwinObjectList(existing?.realities?.hardware?.devices),
          fixtures: normalizeTwinObjectList(existing?.realities?.hardware?.fixtures)
        },
        software: {
          services: [...normalizeTwinObjectList(existing?.realities?.software?.services), ...normalizeTwinObjectList(proposed.software)],
          apis: normalizeTwinObjectList(existing?.realities?.software?.apis),
          queues: normalizeTwinObjectList(existing?.realities?.software?.queues),
          permissions: normalizeTwinObjectList(existing?.realities?.software?.permissions)
        },
        social: {
          roles: normalizeTwinObjectList(existing?.realities?.social?.roles),
          authority: normalizeTwinObjectList(existing?.realities?.social?.authority),
          policies: [...normalizeTwinObjectList(existing?.realities?.social?.policies), ...normalizeTwinObjectList(proposed.social)],
          workflows: normalizeTwinObjectList(existing?.realities?.social?.workflows)
        },
        runtime: existing?.realities?.runtime || {}
      },
      contracts: existing?.contracts || {}
    });
    const twins = existing
      ? current.twins.map(t => t.id === nextTwin.id ? nextTwin : t)
      : [nextTwin, ...current.twins];
    await writeOperationalTwins({ twins });
    result = { ...result, twinId: nextTwin.id };
  } else if (target === "execution_pack") {
    const current = await readOutcomes();
    const projectId = `out-mission-${slug(artifact.missionId || mission.title || "mission")}`;
    const payload = artifact.payload || {};
    const missing = Array.isArray(payload.missing) ? payload.missing : [];
    const task = normalizeOutcomeTask({
      id: `task-exec-${slug(artifact.id)}`,
      title: "Clear execution pack prerequisites",
      detail: missing.length ? `Missing: ${missing.join(", ")}` : "Review execution pack candidate and attach approved twin state.",
      domain: "execution readiness",
      status: missing.length ? "blocked" : "backlog",
      priority: 5,
      dependsOn: artifact.parentArtifactIds,
      updatedAt: now
    });
    const existing = current.projects.find(p => p.id === projectId);
    const project = normalizeOutcomeProject(existing || {
      id: projectId,
      name: `${mission.title || "Mission"} outcomes`,
      domains: ["execution readiness"],
      goalType: "mission_task_graph",
      status: "active",
      tags: stringArray(mission.tags, "execution")
    });
    const taskMap = new Map(project.tasks.map(item => [item.id, item]));
    taskMap.set(task.id, { ...(taskMap.get(task.id) || {}), ...task, updatedAt: now });
    project.tasks = [...taskMap.values()].map(normalizeOutcomeTask);
    project.updatedAt = now;
    const projects = existing
      ? current.projects.map(p => p.id === project.id ? project : p)
      : [project, ...current.projects];
    await writeOutcomes({ projects });
    result = { ...result, projectId: project.id, taskId: task.id };
  }

  const updatedArtifacts = artifactState.artifacts.map(item => item.id === artifact.id
    ? { ...item, status: "promoted", promotion, updatedAt: now }
    : item);
  await writeArtifacts({ artifacts: updatedArtifacts });
  const refreshedArtifacts = missionArtifacts(updatedArtifacts, artifact.missionId);
  const nextMission = normalizeMission({ ...mission, status: deriveMissionPhase(mission, refreshedArtifacts), updatedAt: now }, refreshedArtifacts);
  await writeMissions({ missions: missionState.missions.map(m => m.id === nextMission.id ? nextMission : m) });
  return { ...result, artifact: updatedArtifacts.find(item => item.id === artifact.id), mission: nextMission };
}

function humanArtifactType(type = "") {
  return String(type || "artifact").replace(/_/g, " ");
}

async function promoteMissionArtifacts(missionId, body = {}) {
  const artifactState = await readArtifacts();
  const limit = Math.max(1, Math.min(100, num(body.limit, 30)));
  const includeNeedsReview = body.includeNeedsReview !== false;
  const eligible = artifactState.artifacts
    .filter(item => item.missionId === missionId)
    .filter(item => item.status !== "promoted")
    .filter(item => artifactPromotionTarget(item) !== "mission_only")
    .filter(item => includeNeedsReview || item.reviewStatus === "approved")
    .slice(0, limit);
  const results = [];
  for (const artifact of eligible) {
    const promoted = await promoteArtifact(artifact.id, { target: body.target || artifactPromotionTarget(artifact) });
    if (promoted) results.push(promoted);
  }
  return { ok: true, count: results.length, results };
}

async function readIngestLog() {
  const parsed = await readJsonFile(INGEST_LOG_FILE, []);
  return Array.isArray(parsed) ? parsed : [];
}

async function appendIngestLog(entry) {
  const log = await readIngestLog();
  log.unshift({
    id: entry.id || `ingest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    type: entry.type || "ingest",
    label: entry.label || "",
    status: entry.status || "completed",
    count: num(entry.count, 0),
    detail: entry.detail || "",
    createdAt: entry.createdAt || new Date().toISOString()
  });
  await writeJsonFile(INGEST_LOG_FILE, log.slice(0, 250));
}

function searchableText(expert) {
  return [
    expert.name, expert.cancerType, expert.domain, expert.geography, expert.institution,
    expert.archetype, expert.likelyNetwork, expert.contactRoute, expert.niche,
    expert.approach, expert.complianceFlags, ...(expert.queryTerms || []), ...(expert.tags || []),
    ...(expert.questionsToAsk || []), ...(expert.evidenceLinks || [])
  ].join(" ").toLowerCase();
}

function totalScore(expert) {
  const s = expert.scores || {};
  return num(s.relevance) + num(s.recency) + num(s.decision) + num(s.independence) + num(s.accessibility) + num(s.risk);
}

function queryExperts(experts, params) {
  const q = String(params.get("q") || "").trim().toLowerCase();
  const cancerType = String(params.get("cancerType") || params.get("cancer_type") || "all");
  const categoryFilters = {};
  for (const key of TAG_CATEGORIES) {
    const values = [
      ...params.getAll(key).flatMap(tagsOf),
      ...tagsOf(params.get(`${key}s`))
    ];
    if (values.length) categoryFilters[key] = [...new Set(values)];
  }
  const tagCategory = tagOf(params.get("tagCategory") || params.get("category"));
  const tagTerms = [...params.getAll("tag").flatMap(tagsOf), ...tagsOf(params.get("tags"))];
  if (tagCategory && TAG_CATEGORIES.includes(tagCategory) && tagTerms.length) {
    categoryFilters[tagCategory] = [...new Set([...(categoryFilters[tagCategory] || []), ...tagTerms])];
  }
  const terms = q.split(/\s+/).filter(Boolean);

  return experts
    .filter(expert => cancerType === "all" || expert.cancerType === cancerType)
    .filter(expert => {
      const groups = expert.tagGroups || normalizeTagGroups(expert);
      for (const [key, requested] of Object.entries(categoryFilters)) {
        const existing = arrayOf(groups[key]);
        if (!requested.every(tag => existing.some(value => matchTagValue(value, tag)))) return false;
      }
      return true;
    })
    .filter(expert => {
      if (!terms.length) return true;
      const text = searchableText(expert);
      return terms.every(term => text.includes(term));
    })
    .sort((a, b) => totalScore(b) - totalScore(a) || a.name.localeCompare(b.name));
}

async function parseJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const buf = Buffer.concat(chunks);
  if (!buf.length) return {};
  // Cope with common Windows clients:
  // - PowerShell may POST UTF-16LE strings (BOM: FF FE)
  // - Some tools include a UTF-8 BOM (EF BB BF)
  let raw;
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    raw = buf.toString("utf16le");
  } else {
    raw = buf.toString("utf8");
  }
  const cleaned = raw
    .replace(/\0/g, "")
    .trimStart()
    .replace(/^\uFEFF/, "");
  return cleaned ? JSON.parse(cleaned) : {};
}

function expertsFromBody(body) {
  const payload = Array.isArray(body) ? body : body.experts || body.expert_candidates || body.items || body.expert || body;
  return (Array.isArray(payload) ? payload : [payload]).map(normalizeExpert).filter(e => e.name);
}

function normalizeSeek(raw) {
  const source = raw?.seek || raw || {};
  return {
    use_case: source.use_case || source.decision || "Find experts for a niche research question",
    domain: source.domain || source.cancer_type || source.niche || "oncology",
    geography: source.geography || "global",
    expert_depth: source.expert_depth || source.archetype || "operator | researcher | clinician",
    exclusion: arrayOf(source.exclusion || ["current employees", "MNPI / confidential info"]),
    tags: tagsOf(source.tags || source.tag || source.query_terms || source.keywords),
    tag_groups: normalizeTagGroups(source.tag_groups || source.tagGroups || {}),
    output: source.output || "catalog",
    max_experts: Math.max(1, Math.min(50, num(source.max_experts, 12)))
  };
}

function crawlPrompt(job) {
  return `You are running Argos Expert Radar crawl job ${job.id}.

Knowledge need:
${JSON.stringify(job.seek, null, 2)}

Crawl public sources only:
- academic profiles and hospital profiles
- guidelines and clinical trial pages
- conference talks and abstracts
- PubMed / papers
- podcasts and interviews
- public expert-network snippets
- regulatory or court filings only when relevant

Exclude:
- current employees when the target company is material to the decision
- MNPI, confidential patient details, private trial data, or non-public commercial data

Return only JSON in this shape, then POST it to ${job.ingestUrl}:

{
  "crawl_job_id": "${job.id}",
  "experts": [
    {
      "name": "Expert Name, MD",
      "cancer_type": "Specific cancer / niche",
      "domain": "clinical / surgical / translational / market / policy domain",
      "geography": "where expertise matters",
      "institution": "current public affiliation if relevant",
      "archetype": "medical oncologist | surgeon | researcher | regulator | buyer | ...",
        "tag_groups": {
          "field": ["broad field tags"],
          "subfield": ["more specific field tags"],
          "topic": ["logical tags derived from the niche"],
          "method": ["approach or method tags"],
          "domain": ["field or specialty tags"],
          "geo": ["location tags"],
          "institution": ["organization tags"],
          "archetype": ["role tags"],
          "rank_signal": ["top 1 percent signal tags"],
          "contactability": ["direct email | lab page | linkedin | expert network"],
          "compliance": ["boundary tags"],
          "source": ["paper | profile | guideline | podcast | conference | github | patent | web"]
        },
      "tags": ["flat union of the tag_groups values"],
      "evidence_links": ["https://source.example"],
      "likely_network": "Direct | GLG | AlphaSights | Guidepoint | Third Bridge | Dialectica | Tegus | Atheneum | Techspert | Other",
      "contact_route": "best compliant route",
      "thesis_fit": "decision this expert can de-risk",
      "niche": "one-line niche",
      "approach": "how this expert approaches the niche differently",
      "query_terms": ["terms that should find this expert later"],
      "questions_to_ask": ["high-value compliant question"],
      "compliance_flags": "explicit boundaries",
      "call_value_estimate": 700,
      "scores": {
        "relevance": 0,
        "recency": 0,
        "decision_proximity": 0,
        "independence": 0,
        "accessibility": 0,
        "risk": 0
      }
    }
  ]
}
`;
}

function expertCrawlJsonSchema(jobId) {
  const scoreSchema = {
    type: "object",
    additionalProperties: false,
    required: ["relevance", "recency", "decision_proximity", "independence", "accessibility", "risk"],
    properties: {
      relevance: { type: "number" },
      recency: { type: "number" },
      decision_proximity: { type: "number" },
      independence: { type: "number" },
      accessibility: { type: "number" },
      risk: { type: "number" }
    }
  };
  const expertSchema = {
    type: "object",
    additionalProperties: false,
    required: [
      "name", "cancer_type", "domain", "geography", "institution", "archetype",
      "tag_groups", "evidence_links", "likely_network", "contact_route", "thesis_fit", "niche",
      "approach", "query_terms", "questions_to_ask", "compliance_flags",
      "call_value_estimate", "scores"
    ],
    properties: {
      name: { type: "string" },
      cancer_type: { type: "string" },
      domain: { type: "string" },
      geography: { type: "string" },
      institution: { type: "string" },
      archetype: { type: "string" },
      tag_groups: {
        type: "object",
        additionalProperties: false,
        required: TAG_CATEGORIES,
          properties: {
          field: { type: "array", items: { type: "string" } },
          subfield: { type: "array", items: { type: "string" } },
          topic: { type: "array", items: { type: "string" } },
          method: { type: "array", items: { type: "string" } },
          domain: { type: "array", items: { type: "string" } },
          geo: { type: "array", items: { type: "string" } },
          institution: { type: "array", items: { type: "string" } },
          archetype: { type: "array", items: { type: "string" } },
          rank_signal: { type: "array", items: { type: "string" } },
          contactability: { type: "array", items: { type: "string" } },
          compliance: { type: "array", items: { type: "string" } },
          source: { type: "array", items: { type: "string" } }
        }
      },
      tags: { type: "array", items: { type: "string" } },
      evidence_links: { type: "array", items: { type: "string" } },
      likely_network: { type: "string" },
      contact_route: { type: "string" },
      thesis_fit: { type: "string" },
      niche: { type: "string" },
      approach: { type: "string" },
      query_terms: { type: "array", items: { type: "string" } },
      questions_to_ask: { type: "array", items: { type: "string" } },
      compliance_flags: { type: "string" },
      call_value_estimate: { type: "number" },
      scores: scoreSchema
    }
  };
  return {
    type: "object",
    additionalProperties: false,
    required: ["crawl_job_id", "experts"],
    properties: {
      crawl_job_id: { type: "string" },
      experts: { type: "array", items: expertSchema }
    }
  };
}

function extractResponseText(response) {
  if (typeof response.output_text === "string") return response.output_text;
  const parts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
    }
  }
  return parts.join("\n").trim();
}

async function createCrawlJob(body, req) {
  const now = new Date().toISOString();
  const base = `http://${req.headers.host || `127.0.0.1:${PORT}`}`;
  const job = {
    id: `crawl-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    status: "requested",
    seek: normalizeSeek(body),
    ingestUrl: `${base}/api/experts`,
    queryUrl: `${base}/api/experts`,
    createdAt: now,
    updatedAt: now
  };
  job.prompt = crawlPrompt(job);
  const jobs = await readCrawlJobs();
  jobs.push(job);
  await writeCrawlJobs(jobs);
  return job;
}

async function callCodexForExperts(job) {
  const workdir = await mkdtemp(join(tmpdir(), "ens-navigator-codex-"));
  const schemaPath = join(workdir, "output-schema.json");
  const promptPath = join(workdir, "prompt.txt");
  const outputPath = join(workdir, "last-message.json");
  await writeFile(schemaPath, JSON.stringify(expertCrawlJsonSchema(job.id), null, 2), "utf8");
  await writeFile(
    promptPath,
    `${job.prompt}\n\nImportant:\n- Use live web search.\n- Use only public, sourceable evidence.\n- Every expert must have at least one real evidence URL.\n- Return only the strict JSON object required by the schema.\n- Do not add commentary outside JSON.`,
    "utf8"
  );

  const codexScript = process.env.CODEX_SCRIPT_PATH || join(process.env.APPDATA || "", "npm", "codex.ps1");
  const codexArgs = [
    "--search",
    ...(process.env.CODEX_MODEL ? ["--model", process.env.CODEX_MODEL] : []),
    "exec",
    "--skip-git-repo-check",
    "--output-schema",
    schemaPath,
    "--output-last-message",
    outputPath,
    "-"
  ];
  const child = spawn("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    codexScript,
    ...codexArgs
  ], {
    cwd: ROOT,
    env: process.env,
    stdio: ["pipe", "pipe", "pipe"]
  });

  let stderr = "";
  child.stderr.on("data", chunk => { stderr += chunk.toString(); });
  child.stdout.on("data", () => {});
  child.stdin.end(await readFile(promptPath, "utf8"));

  const exitCode = await new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", code => resolve(code));
  });

  if (exitCode !== 0) {
    throw new Error(stderr.trim() || `Codex exec exited with code ${exitCode}`);
  }

  const raw = await readFile(outputPath, "utf8");
  const parsed = JSON.parse(raw);
  if (parsed.crawl_job_id !== job.id) parsed.crawl_job_id = job.id;
  return parsed;
}

async function ingestExpertsPayload(body) {
  const incoming = expertsFromBody(body);
  const existing = await readExperts();
  const merged = mergeExperts(existing, incoming);
  await writeExperts(merged);
  if (body?.crawl_job_id) {
    await updateCrawlJob(body.crawl_job_id, { status: "completed", ingested: incoming.length });
  }
  await appendIngestLog({
    type: body?.crawl_job_id ? "crawl" : "catalog",
    label: body?.crawl_job_id || body?.label || "Catalog ingest",
    status: "completed",
    count: incoming.length,
    detail: `${merged.length} catalog experts total`
  });
  return { incoming, merged };
}

async function readCrawlJobs() {
  await mkdir(DATA_DIR, { recursive: true });
  if (!existsSync(CRAWL_FILE)) return [];
  const raw = await readFile(CRAWL_FILE, "utf8");
  const parsed = raw.trim() ? JSON.parse(raw) : [];
  return Array.isArray(parsed) ? parsed : [];
}

async function writeCrawlJobs(jobs) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CRAWL_FILE, JSON.stringify(jobs, null, 2), "utf8");
}

async function updateCrawlJob(id, patch) {
  if (!id) return;
  const jobs = await readCrawlJobs();
  const idx = jobs.findIndex(job => job.id === id);
  if (idx === -1) return;
  jobs[idx] = { ...jobs[idx], ...patch, updatedAt: new Date().toISOString() };
  await writeCrawlJobs(jobs);
}

async function handleApi(req, res, url) {
  if (req.method === "OPTIONS") return send(res, 204, "");

  if (req.method === "GET" && url.pathname === "/api/health") {
    const experts = await readExperts();
    const pipeline = await readPipelineExperts();
    const domainKnowledge = await readDomainKnowledge();
    const operationalTwins = await readOperationalTwins();
    const missions = await readMissions();
    const artifacts = await readArtifacts();
    return send(res, 200, {
      ok: true,
      experts: experts.length,
      pipeline: pipeline.length,
      domainKnowledge: domainKnowledge.counts,
      operationalTwins: operationalTwins.twins.length,
      missions: missions.missions.length,
      artifacts: artifacts.artifacts.length,
      dataFile: DATA_FILE,
      pipelineFile: PIPELINE_FILE,
      domainKnowledgeFile: DOMAIN_KNOWLEDGE_FILE,
      operationalTwinsFile: OPERATIONAL_TWINS_FILE
    });
  }

  if (req.method === "GET" && url.pathname === "/api/schema") {
    return send(res, 200, {
      crawl: "POST /api/crawl",
      crawl_and_ingest: "POST /api/crawl-and-ingest",
      ingest: "POST /api/experts",
      pipeline: "GET/POST /api/pipeline",
      domain_knowledge: "GET/POST /api/domain-knowledge",
      domain_knowledge_ingest: "POST /api/domain-knowledge/ingest",
      operational_twins: "GET/POST /api/operational-twins",
      missions: "GET/POST /api/missions",
      mission_detail: "GET /api/missions/:id",
      mission_step: "POST /api/missions/:id/step",
      mission_branch: "POST /api/missions/:id/branch",
      mission_merge: "POST /api/missions/:id/merge",
      artifacts: "GET/POST /api/artifacts?missionId=...",
      artifact_promote: "POST /api/artifacts/:id/promote",
      reviews: "GET/POST /api/reviews",
      agents: "GET/POST /api/agents",
      saved_views: "GET/POST /api/saved-views",
      ingest_log: "GET /api/ingest-log",
      query: "GET /api/experts?q=RPLND&tag=surgery",
      query_tags: "GET /api/experts?topic=RPLND&method=RPLND",
      crawl_shape: {
        seek: {
          use_case: "What decision do I need to make?",
          domain: "cancer niche / market / product / technology",
          geography: "where expertise matters",
          expert_depth: "operator | buyer | seller | regulator | researcher | ex-founder | clinician",
          exclusion: ["current employees", "MNPI / confidential info"],
          tags: ["logical tags derived from the niche"],
          tag_groups: {
            field: [],
            subfield: [],
            topic: ["logical tags derived from the niche"],
            method: [],
            domain: [],
            geo: [],
            institution: [],
            archetype: [],
            rank_signal: [],
            contactability: [],
            compliance: [],
            source: []
          },
          output: "catalog | shortlist | questions | call script",
          max_experts: 12
        }
      },
      domain_knowledge_shape: {
        domains: [{ id: "dom-biology", name: "Biology", tags: [], status: "inbox", createdAt: "ISO", updatedAt: "ISO" }],
        claims: [{ id: "claim-...", text: "Sourceable claim", confidence: 0.8, evidence: [], sourceIds: [], personIds: [], domainIds: [], status: "needs_review" }],
        sources: [{ id: "src-...", title: "Paper or profile", url: "https://source.example", type: "paper", personIds: [], domainIds: [] }],
        people: [{ id: "person-...", name: "Expert name", sourceIds: [], domainIds: [], claimIds: [] }],
        questions: [{ id: "q-...", text: "Question to investigate", domainIds: [], claimIds: [], status: "inbox" }],
        links: [{ id: "link-...", from: "person-...", to: "claim-...", type: "supports", direction: "person_to_knowledge" }],
        agentRuns: [{ id: "run-...", direction: "person_to_knowledge", status: "completed", startedAt: "ISO", completedAt: "ISO" }],
        counts: { domains: 0, claims: 0, sources: 0, people: 0, questions: 0, links: 0, agentRuns: 0 }
      },
      operational_twin_shape: {
        twins: [{
          id: "twin-site-id",
          name: "Site Twin",
          siteId: "site_id",
          siteType: "football_pitch | warehouse | clinic | restaurant | ...",
          status: "draft | review | approved | active | needs_source | disputed",
          domains: ["domain name"],
          sourceIds: ["src-..."],
          claimIds: ["claim-..."],
          realities: {
            physical: { zones: [], routes: [], fixtures: [] },
            hardware: { robots: [], devices: [], fixtures: [] },
            software: { services: [], apis: [], queues: [], permissions: [] },
            social: { roles: [], authority: [], policies: [], workflows: [] },
            runtime: { activeTasks: [], alerts: [], telemetry: [] }
          },
          contracts: {
            robodex: {
              hardwareSpec: { schema_version: "HardwareSpec.v1", site_id: "site_id", robots: [], devices: [], fixtures: [] },
              worldModel: { schema_version: "WorldModel.v1", site: { site_id: "site_id", site_type: "football_pitch", coordinate_frame: "local_m" }, zones: [] },
              forgeRequest: { schema_version: "CartridgeForgeRequest.v1", site_id: "site_id", functions: [] }
            },
            isaacSim: {
              schema_version: "IsaacSimSimulationContract.v1",
              status: "operator_supplied",
              fileGroups: [
                { id: "core_scene", extensions: [".usd", ".usda", ".usdc", ".py"] },
                { id: "robot_kinematics", extensions: [".urdf", ".mjcf", ".yaml"] },
                { id: "mesh_cad", extensions: [".fbx", ".obj", ".gltf", ".glb", ".stl"] },
                { id: "visual_physics_surfaces", extensions: [".mdl", ".png", ".jpg", ".dds", ".vdb"] },
                { id: "launch_system", extensions: [".sh", ".bat"] }
              ],
              setupQuestions: [
                "What type of robot is being simulated?",
                "Which tool produced the original robot model?",
                "Is ROS or ROS 2 connected?"
              ],
              artifacts: []
            }
          }
        }]
      },
      shape: {
        name: "Expert name",
        cancer_type: "Cancer domain",
        domain: "Clinical/research/surgical domain",
        geography: "Where expertise matters",
        archetype: "medical oncologist | urologic oncologist | researcher | ...",
        tag_groups: {
          field: ["AI | biotech | neuroscience | nanotechnology"],
          subfield: ["protein design | connectomics | quantum dots"],
          topic: ["logical tags"],
          method: ["method tags"],
          domain: ["domain tags"],
          geo: ["geo tags"],
          institution: ["institution tags"],
          archetype: ["role tags"],
          rank_signal: ["Nobel | Turing | NAS | NAE | HHMI | highly cited"],
          contactability: ["direct email | lab page | LinkedIn | expert network"],
          compliance: ["boundary tags"],
          source: ["source tags"]
        },
        tags: ["logical tags derived from the niche"],
        evidence_links: ["https://source.example"],
        likely_network: "Direct | GLG | AlphaSights | ...",
        contact_route: "How to reach",
        thesis_fit: "Decision this expert can de-risk",
        questions_to_ask: ["Question one"],
        compliance_flags: "MNPI/confidentiality boundaries",
        call_value_estimate: 700,
        scores: {
          relevance: 5,
          recency: 5,
          decision_proximity: 5,
          independence: 5,
          accessibility: 3,
          risk: -1
        }
      }
    });
  }

  if (req.method === "GET" && url.pathname === "/api/crawl") {
    const jobs = await readCrawlJobs();
    return send(res, 200, { jobs, count: jobs.length });
  }

  if (req.method === "GET" && url.pathname === "/api/ingest-log") {
    const log = await readIngestLog();
    const jobs = await readCrawlJobs();
    const recentJobs = jobs.slice(-50).reverse().map(({ prompt, ...job }) => job);
    return send(res, 200, { items: log, jobs: recentJobs, count: log.length });
  }

  if (req.method === "GET" && url.pathname === "/api/agents") {
    return send(res, 200, await readAgentRegistry());
  }

  if (req.method === "POST" && url.pathname === "/api/agents") {
    const body = await parseJson(req);
    return send(res, 200, await writeAgentRegistry(body));
  }

  if (req.method === "GET" && url.pathname === "/api/policies") {
    return send(res, 200, await readPolicies());
  }

  if (req.method === "POST" && url.pathname === "/api/policies") {
    const body = await parseJson(req);
    const state = normalizePolicyState(body);
    await writeJsonFile(POLICIES_FILE, state);
    return send(res, 200, state);
  }

  if (req.method === "GET" && url.pathname === "/api/missions") {
    const missions = await readMissions();
    const artifacts = await readArtifacts();
    const runs = await readAgentRuns();
    const active = missions.missions.find(m => m.active) || missions.missions[0] || null;
    return send(res, 200, {
      missions: missions.missions,
      active,
      counts: {
        missions: missions.missions.length,
        artifacts: artifacts.artifacts.length,
        agentRuns: runs.runs.length
      }
    });
  }

  if (req.method === "POST" && url.pathname === "/api/missions") {
    const body = await parseJson(req);
    const mission = await createMission(body);
    return send(res, 200, { ok: true, mission });
  }

  const missionMatch = url.pathname.match(/^\/api\/missions\/([^/]+)$/);
  if (req.method === "GET" && missionMatch) {
    const id = decodeURIComponent(missionMatch[1]);
    const missions = await readMissions();
    const artifacts = await readArtifacts();
    const links = await readArtifactLinks();
    const runs = await readAgentRuns();
    const reviews = await readReviews();
    const mission = missions.missions.find(m => m.id === id);
    return mission ? send(res, 200, {
      mission,
      artifacts: missionArtifacts(artifacts.artifacts, id),
      links: links.links.filter(link => link.missionId === id),
      agentRuns: runs.runs.filter(run => run.missionId === id),
      reviews: reviews.reviews.filter(review => review.missionId === id)
    }) : send(res, 404, { error: "Mission not found" });
  }

  const missionActionMatch = url.pathname.match(/^\/api\/missions\/([^/]+)\/(step|branch|merge|promote)$/);
  if (req.method === "POST" && missionActionMatch) {
    const id = decodeURIComponent(missionActionMatch[1]);
    const action = missionActionMatch[2];
    const body = await parseJson(req);
    if (action === "step") {
      const result = await stepMission(id, body);
      return result ? send(res, 200, { ok: true, ...result }) : send(res, 404, { error: "Mission not found" });
    }
    if (action === "branch") {
      const mission = await branchMission(id, body);
      return mission ? send(res, 200, { ok: true, mission }) : send(res, 404, { error: "Mission not found" });
    }
    if (action === "merge") {
      const mission = await mergeMission(id, body);
      return mission ? send(res, 200, { ok: true, mission }) : send(res, 404, { error: "Mission not found" });
    }
    if (action === "promote") {
      const result = await promoteMissionArtifacts(id, body);
      return send(res, 200, result);
    }
  }

  if (req.method === "GET" && url.pathname === "/api/artifacts") {
    const missionId = url.searchParams.get("missionId") || "";
    const type = url.searchParams.get("type") || "";
    const artifacts = await readArtifacts();
    const links = await readArtifactLinks();
    const items = artifacts.artifacts
      .filter(item => !missionId || item.missionId === missionId)
      .filter(item => !type || item.type === type);
    return send(res, 200, {
      artifacts: items,
      links: links.links.filter(link => !missionId || link.missionId === missionId),
      count: items.length
    });
  }

  if (req.method === "POST" && url.pathname === "/api/artifacts") {
    const body = await parseJson(req);
    const artifactState = await readArtifacts();
    const incoming = (Array.isArray(body.artifacts) ? body.artifacts : [body.artifact || body]).map(normalizeArtifact);
    await writeArtifacts({ artifacts: [...incoming, ...artifactState.artifacts] });
    return send(res, 200, { ok: true, artifacts: incoming });
  }

  const artifactActionMatch = url.pathname.match(/^\/api\/artifacts\/([^/]+)\/(review|promote)$/);
  if (req.method === "POST" && artifactActionMatch) {
    const id = decodeURIComponent(artifactActionMatch[1]);
    const action = artifactActionMatch[2];
    const body = await parseJson(req);
    if (action === "review") {
      const artifactState = await readArtifacts();
      const artifact = artifactState.artifacts.find(item => item.id === id);
      if (!artifact) return send(res, 404, { error: "Artifact not found" });
      const review = await createReview({
        ...body,
        artifactId: id,
        missionId: artifact.missionId,
        decision: body.decision || body.status || "needs_review"
      });
      return send(res, 200, { ok: true, review });
    }
    if (action === "promote") {
      const result = await promoteArtifact(id, body);
      return result ? send(res, 200, result) : send(res, 404, { error: "Artifact not found" });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/reviews") {
    const missionId = url.searchParams.get("missionId") || "";
    const reviews = await readReviews();
    const items = reviews.reviews.filter(review => !missionId || review.missionId === missionId);
    return send(res, 200, { reviews: items, count: items.length });
  }

  if (req.method === "POST" && url.pathname === "/api/reviews") {
    const body = await parseJson(req);
    const review = await createReview(body);
    return send(res, 200, { ok: true, review });
  }

  if (req.method === "GET" && url.pathname === "/api/domain-knowledge") {
    return send(res, 200, await readDomainKnowledge());
  }

  if (req.method === "POST" && url.pathname === "/api/domain-knowledge") {
    const body = await parseJson(req);
    const saved = await writeDomainKnowledge(body);
    return send(res, 200, saved);
  }

  if (req.method === "POST" && url.pathname === "/api/domain-knowledge/ingest") {
    const body = await parseJson(req);
    const { state, summary } = await ingestDomainKnowledgePayload(body);
    await appendIngestLog({
      type: "domain-knowledge",
      label: body?.agentRun?.id || body?.agentRunId || "Domain knowledge ingest",
      status: "completed",
      count: Object.values(summary).reduce((sum, item) => sum + num(item?.added) + num(item?.updated), 0),
      detail: `${state.counts.claims} claims, ${state.counts.people} people, ${state.counts.sources} sources`
    });
    return send(res, 200, { ok: true, summary, state });
  }

  if (req.method === "GET" && url.pathname === "/api/saved-views") {
    const views = await readSavedViews();
    return send(res, 200, { views, count: views.length });
  }

  if (req.method === "POST" && url.pathname === "/api/saved-views") {
    const body = await parseJson(req);
    const views = Array.isArray(body) ? body : body.views || [];
    await writeSavedViews(views);
    return send(res, 200, { ok: true, views: await readSavedViews() });
  }

  if (req.method === "GET" && url.pathname === "/api/outcomes") {
    return send(res, 200, await readOutcomes());
  }

  if (req.method === "POST" && url.pathname === "/api/outcomes") {
    const body = await parseJson(req);
    const saved = await writeOutcomes(body);
    return send(res, 200, saved);
  }

  if (req.method === "GET" && url.pathname === "/api/operational-twins") {
    return send(res, 200, await readOperationalTwins());
  }

  if (req.method === "POST" && url.pathname === "/api/operational-twins") {
    const body = await parseJson(req);
    const saved = await writeOperationalTwins(body);
    return send(res, 200, saved);
  }

  if (req.method === "GET" && url.pathname === "/api/pipeline") {
    const experts = await readPipelineExperts();
    return send(res, 200, { experts, count: experts.length });
  }

  if (req.method === "POST" && url.pathname === "/api/pipeline") {
    const body = await parseJson(req);
    const experts = Array.isArray(body) ? body : body.experts || [];
    await writePipelineExperts(experts);
    const saved = await readPipelineExperts();
    return send(res, 200, { ok: true, experts: saved, count: saved.length });
  }

  const crawlMatch = url.pathname.match(/^\/api\/crawl\/([^/]+)$/);
  if (req.method === "GET" && crawlMatch) {
    const jobs = await readCrawlJobs();
    const job = jobs.find(item => item.id === crawlMatch[1]);
    return job ? send(res, 200, job) : send(res, 404, { error: "Crawl job not found" });
  }

  if (req.method === "POST" && url.pathname === "/api/crawl") {
    const body = await parseJson(req);
    const job = await createCrawlJob(body, req);
    return send(res, 200, job);
  }

  if (req.method === "POST" && url.pathname === "/api/crawl-and-ingest") {
    const body = await parseJson(req);
    const job = await createCrawlJob(body, req);
    await updateCrawlJob(job.id, { status: "running" });
    try {
      const aiPayload = await callCodexForExperts(job);
      const { incoming } = await ingestExpertsPayload({ ...aiPayload, crawl_job_id: job.id });
      return send(res, 200, {
        id: job.id,
        status: "completed",
        expert_count: incoming.length,
        experts: incoming
      });
    } catch (error) {
      await updateCrawlJob(job.id, { status: "failed", error: error.message || "AI crawl failed" });
      return send(res, 500, {
        id: job.id,
        status: "failed",
        error: error.message || "AI crawl failed"
      });
    }
  }

  if (req.method === "GET" && url.pathname === "/api/experts") {
    const experts = queryExperts(await readExperts(), url.searchParams);
    return send(res, 200, { experts, count: experts.length });
  }

  if (req.method === "POST" && (url.pathname === "/api/experts" || url.pathname === "/api/ingest")) {
    const body = await parseJson(req);
    const { incoming, merged } = await ingestExpertsPayload(body);
    return send(res, 200, { ok: true, ingested: incoming.length, experts: merged.length });
  }

  return send(res, 404, { error: "Unknown API route" });
}

async function serveStatic(req, res, url) {
  if (url.pathname === "/favicon.ico") return send(res, 204, "", "text/plain; charset=utf-8");
  const pathname = url.pathname === "/" ? "/index.html" : decodeURIComponent(url.pathname);
  const file = resolve(ROOT, "." + pathname);
  if (!file.startsWith(ROOT)) return send(res, 403, "Forbidden", "text/plain; charset=utf-8");
  try {
    const body = await readFile(file);
    send(res, 200, body, MIME[extname(file)] || "application/octet-stream");
  } catch {
    send(res, 404, "Not found", "text/plain; charset=utf-8");
  }
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "127.0.0.1"}`);
    if (url.pathname.startsWith("/api/")) return await handleApi(req, res, url);
    return await serveStatic(req, res, url);
  } catch (error) {
    send(res, 500, { error: error.message || "Server error" });
  }
}).listen(PORT, "127.0.0.1", () => {
  console.log(`ENS Navigator local API: http://127.0.0.1:${PORT}`);
  console.log(`Expert ingest endpoint: POST http://127.0.0.1:${PORT}/api/experts`);
});
