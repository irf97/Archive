# ENS Navigator Local API

Start:

```powershell
node server.mjs
```

MCP bridge for Codex:

```powershell
codex mcp add ens-navigator -- node "C:\AI\Projects\ENS Navigator\mcp-server.mjs"
```

If you want to run the MCP bridge directly:

```powershell
node mcp-server.mjs
```

Open:

```text
http://127.0.0.1:8787
```

Query experts:

```text
GET http://127.0.0.1:8787/api/experts?q=RPLND
GET http://127.0.0.1:8787/api/experts?q=cisplatin%20resistance
GET http://127.0.0.1:8787/api/experts?topic=surgery
GET http://127.0.0.1:8787/api/experts?method=translational%20research
GET http://127.0.0.1:8787/api/experts?tagCategory=topic&tag=surgery
GET http://127.0.0.1:8787/api/experts?domain=GU%20medical%20oncology&geo=United%20States
```

Domain Knowledge graph:

```text
GET  http://127.0.0.1:8787/api/domain-knowledge
POST http://127.0.0.1:8787/api/domain-knowledge
POST http://127.0.0.1:8787/api/domain-knowledge/ingest
```

`GET /api/domain-knowledge` returns:

```json
{
  "domains": [],
  "claims": [],
  "sources": [],
  "people": [],
  "questions": [],
  "links": [],
  "agentRuns": [],
  "counts": {
    "domains": 0,
    "claims": 0,
    "sources": 0,
    "people": 0,
    "questions": 0,
    "links": 0,
    "agentRuns": 0
  }
}
```

`POST /api/domain-knowledge` replaces the full normalized state.

`POST /api/domain-knowledge/ingest` merges agent output and dedupes by stable IDs or natural keys:

```json
{
  "agentRun": {
    "id": "run-example",
    "direction": "person_to_knowledge",
    "status": "completed"
  },
  "claims": [
    {
      "text": "Publicly sourceable claim.",
      "confidence": 0.8,
      "sourceIds": ["src-example"],
      "personIds": ["person-example"],
      "domainIds": ["dom-example"],
      "evidence": ["https://source.example"]
    }
  ],
  "sources": [
    {
      "id": "src-example",
      "title": "Paper or profile",
      "url": "https://source.example",
      "type": "paper"
    }
  ],
  "people": [
    {
      "id": "person-example",
      "name": "Expert Name",
      "sourceIds": ["src-example"]
    }
  ],
  "links": [
    {
      "from": "person-example",
      "to": "claim-example",
      "type": "supports"
    }
  ]
}
```

AI-generated reviewable records default to `status: "inbox"` when status is omitted. Provenance fields include `agentRunId`, `direction`, `sourceIds`, `personIds`, `domainIds`, `claimIds`, and `questionIds`.

MCP tools:

```text
read-domain-knowledge
ingest-domain-knowledge
```

Create a crawl job for an AI agent:

```text
POST http://127.0.0.1:8787/api/crawl
Content-Type: application/json
```

```json
{
  "seek": {
    "use_case": "Find experts who understand why some germ-cell tumors resist cisplatin",
    "domain": "testicular cancer / cisplatin resistance",
    "geography": "US and Europe",
    "expert_depth": "researcher | medical oncologist | urologic oncologist",
    "exclusion": ["current employees", "MNPI / confidential info"],
    "tags": ["cisplatin resistance", "germ cell tumors", "translational research"],
    "tag_groups": {
      "topic": ["cisplatin resistance", "germ cell tumors"],
      "method": ["translational research"],
      "domain": ["testicular cancer", "GU oncology"],
      "geo": ["US", "Europe"],
      "institution": [],
      "archetype": ["researcher", "medical oncologist"],
      "compliance": [],
      "source": []
    },
    "output": "catalog",
    "max_experts": 12
  }
}
```

The response includes:

```json
{
  "id": "crawl-...",
  "status": "requested",
  "ingestUrl": "http://127.0.0.1:8787/api/experts",
  "prompt": "Send this to the AI crawler..."
}
```

Give the returned `prompt` to the AI crawler. It will include `crawl_job_id` when it posts results back to `/api/experts`, and the server will mark the job `completed`.

Generate and ingest experts through the local Codex CLI:

```powershell
node server.mjs
```

```text
POST http://127.0.0.1:8787/api/crawl-and-ingest
Content-Type: application/json
```

```json
{
  "seek": {
    "use_case": "Find experts on PARP resistance in ovarian cancer",
    "domain": "ovarian cancer / PARP resistance",
    "geography": "US and Europe",
    "expert_depth": "researcher | medical oncologist",
    "exclusion": ["current employees", "MNPI / confidential info"],
    "output": "catalog",
    "max_experts": 12
  }
}
```

The browser never receives an API key. The server invokes `codex exec` locally with live search, validates JSON, and stores the result.

Ingest AI crawl output:

```text
POST http://127.0.0.1:8787/api/experts
Content-Type: application/json
```

```json
{
  "experts": [
    {
      "name": "Expert Name, MD",
      "cancer_type": "Testicular cancer / germ cell tumors",
      "domain": "GU medical oncology",
      "geography": "United States",
      "archetype": "medical oncologist",
      "tag_groups": {
        "topic": ["cisplatin resistance", "germ cell tumors"],
        "method": ["translational research"],
        "domain": ["GU oncology"],
        "geo": ["United States"],
        "institution": ["Some Hospital"],
        "archetype": ["medical oncologist"],
        "compliance": ["no mnpi"],
        "source": ["paper", "profile"]
      },
      "tags": ["cisplatin resistance", "germ cell tumors"],
      "evidence_links": ["https://source.example/profile"],
      "likely_network": "Direct",
      "contact_route": "institution profile",
      "thesis_fit": "Decision this expert can de-risk.",
      "questions_to_ask": ["What should we ask first?"],
      "compliance_flags": "No MNPI, no confidential patient or trial details.",
      "call_value_estimate": 700,
      "scores": {
        "relevance": 5,
        "recency": 5,
        "decision_proximity": 5,
        "independence": 5,
        "accessibility": 3,
        "risk": -1
      }
    }
  ]
}
```

Storage:

```text
data/oncology-experts.json
data/crawl-jobs.json
```

Seed at least 100 state-of-the-art biotech R&D query leads:

```powershell
npm run seed:biotech
```

This writes only data files:

```text
data/oncology-experts.json
data/biotech-rd-queries.json
```

Seed top 1% scientist catalogs for AI, computer science, neuroscience, and nanotechnology:

```powershell
npm run seed:top-scientists
```

This adds 50 records per field and writes:

```text
data/oncology-experts.json
data/top-scientists-queries.json
```
