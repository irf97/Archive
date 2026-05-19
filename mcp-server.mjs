import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE_URL = process.env.ENS_NAVIGATOR_API_URL || "http://127.0.0.1:8787";

async function requestJson(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { "content-type": "application/json", ...(options.headers || {}) },
    ...options
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const message = json?.error || json?.message || `HTTP ${res.status}`;
    throw new Error(message);
  }
  return json;
}

const SeekSchema = z.object({
  use_case: z.string().min(1),
  domain: z.string().min(1),
  geography: z.string().optional().default("global"),
  expert_depth: z.string().optional().default("researcher"),
  exclusion: z.array(z.string()).optional().default([]),
  tags: z.array(z.string()).optional().default([]),
  tag_groups: z.record(z.array(z.string())).optional().default({}),
  output: z.string().optional().default("catalog"),
  max_experts: z.number().int().positive().max(50).optional().default(12)
});

const ExpertSchema = z.object({
  name: z.string().min(1),
  cancer_type: z.string().min(1),
  domain: z.string().min(1),
  geography: z.string().optional().default(""),
  institution: z.string().optional().default(""),
  archetype: z.string().optional().default("medical oncologist"),
  tag_groups: z.record(z.array(z.string())).optional().default({}),
  tags: z.array(z.string()).optional().default([]),
  evidence_links: z.array(z.string()).optional().default([]),
  likely_network: z.string().optional().default("Direct"),
  contact_route: z.string().optional().default(""),
  thesis_fit: z.string().optional().default(""),
  niche: z.string().optional().default(""),
  approach: z.string().optional().default(""),
  query_terms: z.array(z.string()).optional().default([]),
  questions_to_ask: z.array(z.string()).optional().default([]),
  compliance_flags: z.string().optional().default(""),
  call_value_estimate: z.number().optional().default(0),
  scores: z.object({
    relevance: z.number().optional().default(3),
    recency: z.number().optional().default(3),
    decision_proximity: z.number().optional().default(3),
    independence: z.number().optional().default(3),
    accessibility: z.number().optional().default(3),
    risk: z.number().optional().default(0)
  }).optional().default({})
});

const DomainKnowledgeAgentRunSchema = z.object({
  id: z.string().optional(),
  agentRunId: z.string().optional(),
  direction: z.enum(["person_to_knowledge", "knowledge_to_people"]).optional(),
  status: z.string().optional(),
  prompt: z.string().optional(),
  summary: z.string().optional()
}).passthrough();

const DomainKnowledgeRecordSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
  url: z.string().optional(),
  type: z.string().optional(),
  tags: z.array(z.string()).optional(),
  confidence: z.number().optional(),
  evidence: z.array(z.string()).optional(),
  status: z.string().optional(),
  agentRunId: z.string().optional(),
  direction: z.enum(["person_to_knowledge", "knowledge_to_people"]).optional(),
  sourceIds: z.array(z.string()).optional(),
  personIds: z.array(z.string()).optional(),
  domainIds: z.array(z.string()).optional(),
  claimIds: z.array(z.string()).optional(),
  questionIds: z.array(z.string()).optional()
}).passthrough();

const DomainKnowledgeIngestSchema = z.object({
  agentRun: DomainKnowledgeAgentRunSchema.optional(),
  agentRunId: z.string().optional(),
  direction: z.enum(["person_to_knowledge", "knowledge_to_people"]).optional(),
  domains: z.array(DomainKnowledgeRecordSchema).optional().default([]),
  claims: z.array(DomainKnowledgeRecordSchema).optional().default([]),
  sources: z.array(DomainKnowledgeRecordSchema).optional().default([]),
  people: z.array(DomainKnowledgeRecordSchema).optional().default([]),
  questions: z.array(DomainKnowledgeRecordSchema).optional().default([]),
  links: z.array(DomainKnowledgeRecordSchema).optional().default([])
});

const server = new McpServer({
  name: "ens-navigator",
  version: "1.0.0"
});

function registerToolAliases(names, config, handler) {
  for (const name of names) {
    server.registerTool(name, config, handler);
  }
}

registerToolAliases(
  ["1-query-experts", "query-experts"],
  {
    title: "Query Experts",
    description: "Search the local expert store by niche, domain, category tags, cancer type, or tags.",
    inputSchema: {
      q: z.string().optional().default(""),
      cancerType: z.string().optional().default("all"),
      tag: z.string().optional().default(""),
      tags: z.array(z.string()).optional().default([]),
      tagCategory: z.string().optional().default(""),
      tagGroups: z.record(z.array(z.string())).optional().default({})
    }
  },
  async ({ q, cancerType, tag, tags, tagCategory, tagGroups }) => {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (cancerType && cancerType !== "all") params.set("cancerType", cancerType);
    if (tag) params.set("tag", tag);
    if (tags?.length) params.set("tags", tags.join(","));
    if (tagCategory) params.set("tagCategory", tagCategory);
    for (const [category, values] of Object.entries(tagGroups || {})) {
      if (Array.isArray(values) && values.length) {
        for (const value of values) params.append(category, value);
      }
    }
    const data = await requestJson(`/api/experts?${params.toString()}`);
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data
    };
  }
);

registerToolAliases(
  ["2-create-crawl-job", "create-crawl-job"],
  {
    title: "Create Crawl Job",
    description: "Create a crawl job packet and return the prompt for a niche expert search.",
    inputSchema: {
      seek: SeekSchema
    }
  },
  async ({ seek }) => {
    const data = await requestJson("/api/crawl", {
      method: "POST",
      body: JSON.stringify({ seek })
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data
    };
  }
);

registerToolAliases(
  ["3-crawl-and-ingest", "crawl-and-ingest"],
  {
    title: "Crawl And Ingest",
    description: "Run the server-side OpenAI crawl and save the resulting experts locally.",
    inputSchema: {
      seek: SeekSchema
    }
  },
  async ({ seek }) => {
    const data = await requestJson("/api/crawl-and-ingest", {
      method: "POST",
      body: JSON.stringify({ seek })
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data
    };
  }
);

registerToolAliases(
  ["4-ingest-experts", "ingest-experts"],
  {
    title: "Ingest Experts",
    description: "Write expert records to the local store.",
    inputSchema: {
      experts: z.array(ExpertSchema)
    }
  },
  async ({ experts }) => {
    const data = await requestJson("/api/experts", {
      method: "POST",
      body: JSON.stringify({ experts })
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data
    };
  }
);

registerToolAliases(
  ["5-crawl-jobs", "crawl-jobs"],
  {
    title: "List Crawl Jobs",
    description: "Inspect crawl jobs created by the local server.",
    inputSchema: {
      id: z.string().optional().default("")
    }
  },
  async ({ id }) => {
    const data = await requestJson(id ? `/api/crawl/${encodeURIComponent(id)}` : "/api/crawl");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data
    };
  }
);

registerToolAliases(
  ["6-read-domain-knowledge", "read-domain-knowledge"],
  {
    title: "Read Domain Knowledge",
    description: "Read the normalized ENS Navigator domain knowledge graph.",
    inputSchema: {}
  },
  async () => {
    const data = await requestJson("/api/domain-knowledge");
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data
    };
  }
);

registerToolAliases(
  ["7-ingest-domain-knowledge", "ingest-domain-knowledge"],
  {
    title: "Ingest Domain Knowledge",
    description: "Merge agent-generated domains, claims, sources, people, questions, links, and agent run provenance into the local domain knowledge graph.",
    inputSchema: DomainKnowledgeIngestSchema.shape
  },
  async (payload) => {
    const data = await requestJson("/api/domain-knowledge/ingest", {
      method: "POST",
      body: JSON.stringify(payload)
    });
    return {
      content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
      structuredContent: data
    };
  }
);

await server.connect(new StdioServerTransport());
