import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(".");
const DATA_DIR = join(ROOT, "data");
const DATA_FILE = join(DATA_DIR, "oncology-experts.json");
const QUERY_FILE = join(DATA_DIR, "biotech-rd-queries.json");

const TAG_CATEGORIES = ["topic", "method", "domain", "geo", "institution", "archetype", "compliance", "source"];
const SELECTION_TAG_CATEGORIES = ["topic", "method", "domain", "geo", "archetype"];

const QUERIES = [
  ["Prime editing for monogenic liver diseases", "genome editing", "prime editing", "David R. Liu", "Broad Institute / Harvard University", "genome editing researcher", "United States"],
  ["Base editing for hematologic disease", "genome editing", "base editing", "Nicole Gaudelli", "Beam Therapeutics", "base editing scientist", "United States"],
  ["In vivo CRISPR delivery beyond the liver", "gene therapy delivery", "non-viral delivery", "Daniel G. Anderson", "MIT / Koch Institute", "drug delivery researcher", "United States"],
  ["AAV capsid engineering for tissue tropism", "gene therapy delivery", "viral vector engineering", "Ben Deverman", "Broad Institute", "AAV engineering researcher", "United States"],
  ["ADAR-recruiting RNA editing therapeutics", "RNA therapeutics", "RNA editing", "Thorsten Stafforst", "University of Tuebingen", "RNA editing researcher", "Germany"],
  ["CRISPR transposases for large DNA insertion", "genome editing", "targeted integration", "Feng Zhang", "Broad Institute / MIT", "genome engineering researcher", "United States"],
  ["Programmable recombinases for genome rewriting", "genome editing", "recombinase engineering", "Patrick Hsu", "Arc Institute / UC Berkeley", "genome engineering researcher", "United States"],
  ["Epigenome editing without DNA double-strand breaks", "genome regulation", "epigenome editing", "Charles A. Gersbach", "Duke University", "genome engineering researcher", "United States"],
  ["Mitochondrial base editing", "mitochondrial medicine", "organelle genome editing", "Joseph D. Mougous", "University of Washington", "microbiology and genome editing researcher", "United States"],
  ["Clinical safety assays for genome editing", "genome editing translation", "editing safety", "Fyodor Urnov", "UC Berkeley / Innovative Genomics Institute", "clinical genome editing researcher", "United States"],
  ["CAR T persistence and exhaustion", "cell therapy", "T cell engineering", "Carl H. June", "University of Pennsylvania", "cell therapy researcher", "United States"],
  ["Logic-gated CAR T cells for solid tumors", "cell therapy", "synthetic cell circuits", "Wendell A. Lim", "UCSF", "synthetic cell therapy researcher", "United States"],
  ["Synthetic Notch receptors in cell therapy", "cell therapy", "synthetic receptors", "Kole T. Roybal", "UCSF", "synthetic immunology researcher", "United States"],
  ["Armored CAR T cells for pediatric solid tumors", "cell therapy", "CAR T engineering", "Crystal L. Mackall", "Stanford University", "pediatric cell therapy researcher", "United States"],
  ["TCR-T target discovery and validation", "cell therapy", "TCR engineering", "Ton N. Schumacher", "Netherlands Cancer Institute", "cancer immunology researcher", "Netherlands"],
  ["Engineered NK cells and NK engagers", "cell therapy", "NK cell engineering", "Katy Rezvani", "MD Anderson Cancer Center", "NK cell therapy researcher", "United States"],
  ["Gamma-delta T cell therapy", "cell therapy", "gamma-delta T cells", "Adrian Hayday", "King's College London / Francis Crick Institute", "immunology researcher", "United Kingdom"],
  ["TIL therapy response biomarkers", "cell therapy", "tumor infiltrating lymphocytes", "Steven A. Rosenberg", "National Cancer Institute", "cancer immunotherapy researcher", "United States"],
  ["In vivo generation of therapeutic CAR T cells", "cell therapy delivery", "immune-cell targeted LNPs", "Michael J. Mitchell", "University of Pennsylvania", "nanomedicine researcher", "United States"],
  ["Cell therapy manufacturing analytics", "cell therapy manufacturing", "GMP process analytics", "Bruce L. Levine", "University of Pennsylvania", "cell therapy manufacturing researcher", "United States"],
  ["mRNA vaccine antigen design", "RNA therapeutics", "mRNA vaccines", "Drew Weissman", "University of Pennsylvania", "mRNA vaccine researcher", "United States"],
  ["Self-amplifying RNA vaccine platforms", "RNA therapeutics", "self-amplifying RNA", "Robin Shattock", "Imperial College London", "RNA vaccine researcher", "United Kingdom"],
  ["Circular RNA therapeutics", "RNA therapeutics", "circular RNA biology", "Howard Y. Chang", "Stanford University", "RNA biology researcher", "United States"],
  ["tRNA therapeutics for codon rescue", "RNA therapeutics", "tRNA biology", "Anna Greka", "Broad Institute / Brigham and Women's Hospital", "genetic medicine researcher", "United States"],
  ["Splicing modulation for rare disease", "RNA therapeutics", "splice switching", "Adrian R. Krainer", "Cold Spring Harbor Laboratory", "RNA splicing researcher", "United States"],
  ["Antisense oligonucleotide chemistry", "RNA therapeutics", "antisense chemistry", "Frank Bennett", "Ionis Pharmaceuticals", "antisense therapeutics scientist", "United States"],
  ["GalNAc-conjugated siRNA delivery", "RNA therapeutics", "siRNA conjugates", "Muthiah Manoharan", "Alnylam Pharmaceuticals", "oligonucleotide chemistry scientist", "United States"],
  ["Lipid nanoparticle formulation for RNA drugs", "RNA delivery", "LNP formulation", "Pieter R. Cullis", "University of British Columbia", "lipid nanoparticle researcher", "Canada"],
  ["Non-liver RNA delivery", "RNA delivery", "extrahepatic delivery", "Kathryn A. Whitehead", "Carnegie Mellon University", "RNA delivery researcher", "United States"],
  ["Endosomal escape engineering for nucleic acid drugs", "drug delivery", "endosomal escape", "Samir Mitragotri", "Harvard University", "drug delivery researcher", "United States"],
  ["AI protein structure prediction for drug discovery", "AI biology", "protein structure prediction", "John Jumper", "Google DeepMind", "AI protein structure researcher", "United Kingdom"],
  ["Generative protein design", "AI protein engineering", "de novo protein design", "David Baker", "University of Washington / Institute for Protein Design", "protein design researcher", "United States"],
  ["De novo antibody and binder design", "protein engineering", "computational immunoengineering", "Bruno E. Correia", "EPFL", "protein engineering researcher", "Switzerland"],
  ["Protein language models for enzyme engineering", "AI biology", "protein language models", "Alexander Rives", "EvolutionaryScale", "AI protein modeling researcher", "United States"],
  ["Ultra-large-scale molecular docking", "computational drug discovery", "virtual screening", "Brian Shoichet", "UCSF", "computational drug discovery researcher", "United States"],
  ["AI-guided small molecule design", "AI drug discovery", "machine learning for chemistry", "Regina Barzilay", "MIT", "AI drug discovery researcher", "United States"],
  ["Active-learning wet lab drug discovery", "AI drug discovery", "active learning biology", "Daphne Koller", "insitro", "AI drug discovery founder-scientist", "United States"],
  ["Image-based phenomic drug discovery", "AI drug discovery", "cell painting", "Anne E. Carpenter", "Broad Institute", "phenomics researcher", "United States"],
  ["Automated biology and closed-loop discovery labs", "automation", "robotic science", "Ross D. King", "University of Cambridge", "robotic science researcher", "United Kingdom"],
  ["Foundation models for cellular biology", "AI biology", "single-cell foundation models", "Aviv Regev", "Genentech / Broad Institute", "computational biology researcher", "United States"],
  ["PROTAC degrader design", "targeted protein degradation", "PROTACs", "Craig M. Crews", "Yale University", "chemical biology researcher", "United States"],
  ["Molecular glue discovery", "targeted protein degradation", "molecular glues", "Eric S. Fischer", "Dana-Farber Cancer Institute", "structural chemical biology researcher", "United States"],
  ["Covalent ligand discovery", "chemical biology", "chemoproteomics", "Benjamin F. Cravatt", "Scripps Research", "chemical proteomics researcher", "United States"],
  ["Chemoproteomic target discovery", "chemical biology", "covalent chemical biology", "Daniel K. Nomura", "UC Berkeley", "chemical biology researcher", "United States"],
  ["KRAS covalent inhibitor resistance", "oncology drug discovery", "covalent inhibitors", "Kevan M. Shokat", "UCSF", "chemical biology researcher", "United States"],
  ["RNA-targeting small molecules", "RNA drug discovery", "RNA small molecules", "Amanda E. Hargrove", "Duke University", "RNA chemical biology researcher", "United States"],
  ["Targeted RNA degradation", "RNA drug discovery", "RNA degraders", "Matthew D. Disney", "Scripps Research", "RNA-targeting drug discovery researcher", "United States"],
  ["Induced proximity drug discovery", "chemical biology", "induced proximity", "Stuart L. Schreiber", "Broad Institute / Harvard University", "chemical biology researcher", "United States"],
  ["Kinase chemical biology and degrader pharmacology", "oncology drug discovery", "kinase pharmacology", "Nathanael S. Gray", "Stanford University", "chemical biology researcher", "United States"],
  ["Fragment-based drug discovery for hard targets", "drug discovery", "fragment screening", "Stephen W. Fesik", "Vanderbilt University", "fragment-based drug discovery researcher", "United States"],
  ["Single-cell atlas construction", "single-cell biology", "cell atlas", "Sarah Teichmann", "Wellcome Sanger Institute / Cambridge", "single-cell genomics researcher", "United Kingdom"],
  ["Perturb-seq CRISPR screens", "functional genomics", "CRISPR screens", "Jonathan S. Weissman", "Whitehead Institute / MIT", "functional genomics researcher", "United States"],
  ["Spatial transcriptomics technology", "spatial biology", "multiplexed imaging", "Xiaowei Zhuang", "Harvard University", "spatial genomics researcher", "United States"],
  ["Spatial proteomics imaging", "spatial biology", "mass cytometry imaging", "Garry P. Nolan", "Stanford University", "spatial immunology researcher", "United States"],
  ["Multiplexed tissue imaging for oncology", "spatial biology", "imaging mass cytometry", "Michael Angelo", "Stanford University", "spatial pathology researcher", "United States"],
  ["Multiome sequencing and genome technology", "genomics technology", "multiomics", "Jay Shendure", "University of Washington", "genome technology researcher", "United States"],
  ["Synthetic genomics and large-scale DNA writing", "synthetic biology", "genome writing", "George M. Church", "Harvard University", "synthetic genomics researcher", "United States"],
  ["Long-read clinical genomics", "clinical genomics", "long-read sequencing", "Euan A. Ashley", "Stanford University", "clinical genomics researcher", "United States"],
  ["Single-molecule sequencing and proteomic diagnostics", "genomics technology", "single-molecule measurement", "Stephen Quake", "Stanford University", "bioengineering researcher", "United States"],
  ["Multiomic cell-state inference", "computational biology", "cell-state modeling", "Dana Pe'er", "Memorial Sloan Kettering Cancer Center", "computational biology researcher", "United States"],
  ["Organoid disease modeling", "organoid biology", "adult stem cell organoids", "Hans Clevers", "Hubrecht Institute / Roche", "organoid researcher", "Netherlands"],
  ["Brain organoids for neurodevelopmental disease", "organoid biology", "brain organoids", "Madeline Lancaster", "MRC Laboratory of Molecular Biology", "organoid researcher", "United Kingdom"],
  ["Synthetic embryo models", "developmental biology", "embryo models", "Magdalena Zernicka-Goetz", "Caltech / University of Cambridge", "developmental biology researcher", "United States / United Kingdom"],
  ["iPSC reprogramming platforms", "stem cell biology", "cell reprogramming", "Shinya Yamanaka", "Kyoto University / Gladstone Institutes", "stem cell researcher", "Japan / United States"],
  ["Beta cell replacement for diabetes", "regenerative medicine", "stem-cell-derived beta cells", "Douglas A. Melton", "Harvard University", "stem cell researcher", "United States"],
  ["Liver organoids for disease modeling", "organoid biology", "liver organoids", "Takanori Takebe", "Cincinnati Children's / Tokyo Medical and Dental University", "organoid researcher", "United States / Japan"],
  ["Vascularized tissue models", "tissue engineering", "vascularized organoids", "Christopher S. Chen", "Boston University", "tissue engineering researcher", "United States"],
  ["Bioprinting functional tissues", "tissue engineering", "3D bioprinting", "Jennifer A. Lewis", "Harvard University", "bioprinting researcher", "United States"],
  ["Regenerative immunology and biomaterials", "regenerative medicine", "immunomodulatory biomaterials", "Jennifer H. Elisseeff", "Johns Hopkins University", "regenerative medicine researcher", "United States"],
  ["Tissue stem-cell dynamics", "regenerative biology", "tissue stem cells", "Fiona M. Watt", "EMBL", "stem cell biology researcher", "Germany"],
  ["Cellular senescence therapeutics", "aging biology", "senolytics", "Judith Campisi", "Buck Institute", "aging biology researcher", "United States"],
  ["Partial reprogramming for aging biology", "aging biology", "epigenetic reprogramming", "Juan Carlos Izpisua Belmonte", "Altos Labs", "regenerative biology researcher", "United States"],
  ["Epigenetic aging clocks and biomarkers", "aging biomarkers", "DNA methylation clocks", "Steve Horvath", "Altos Labs / UCLA", "aging biomarker researcher", "United States"],
  ["NAD metabolism interventions", "aging biology", "metabolic longevity", "Leonard P. Guarente", "MIT", "aging biology researcher", "United States"],
  ["Proteostasis and longevity pathways", "aging biology", "proteostasis", "Andrew Dillin", "UC Berkeley", "aging biology researcher", "United States"],
  ["Microbiome live biotherapeutics", "microbiome therapeutics", "commensal immunology", "Sarkis K. Mazmanian", "Caltech", "microbiome researcher", "United States"],
  ["Engineered microbes for therapeutics", "synthetic biology", "engineered probiotics", "Tal Danino", "Columbia University", "synthetic biology researcher", "United States"],
  ["Phage therapy engineering", "microbiome therapeutics", "phage engineering", "Timothy K. Lu", "MIT", "synthetic biology researcher", "United States"],
  ["Microbiome metabolite drug discovery", "microbiome therapeutics", "microbial metabolites", "Justin L. Sonnenburg", "Stanford University", "microbiome researcher", "United States"],
  ["Bacterial synthetic circuits for cancer therapy", "synthetic biology", "bacterial circuits", "Jeff Hasty", "UC San Diego", "synthetic biology researcher", "United States"],
  ["Synthetic gene circuits", "synthetic biology", "gene circuit design", "Michael B. Elowitz", "Caltech", "synthetic biology researcher", "United States"],
  ["Mammalian synthetic biology", "synthetic biology", "mammalian circuit engineering", "Pamela A. Silver", "Harvard University", "synthetic biology researcher", "United States"],
  ["Metabolic pathway engineering", "synthetic biology", "metabolic engineering", "Jay D. Keasling", "UC Berkeley / Lawrence Berkeley National Laboratory", "metabolic engineering researcher", "United States"],
  ["Industrial enzyme directed evolution", "protein engineering", "directed evolution", "Frances H. Arnold", "Caltech", "directed evolution researcher", "United States"],
  ["CRISPR diagnostics beyond Cas13", "diagnostics", "CRISPR diagnostics", "Omar O. Abudayyeh", "MIT / McGovern Institute", "CRISPR diagnostics researcher", "United States"],
  ["SHERLOCK and nucleic acid diagnostics", "diagnostics", "nucleic acid diagnostics", "Jonathan S. Gootenberg", "MIT / McGovern Institute", "CRISPR diagnostics researcher", "United States"],
  ["Liquid biopsy ctDNA MRD", "oncology diagnostics", "ctDNA MRD", "Maximilian Diehn", "Stanford University", "radiation oncology and liquid biopsy researcher", "United States"],
  ["Multi-cancer early detection", "oncology diagnostics", "cancer genomics", "Bert Vogelstein", "Johns Hopkins University", "cancer genomics researcher", "United States"],
  ["Neoantigen cancer vaccines", "cancer immunotherapy", "neoantigen vaccines", "Catherine J. Wu", "Dana-Farber Cancer Institute", "cancer vaccine researcher", "United States"],
  ["Cancer immunopeptidomics", "cancer immunotherapy", "immunopeptidomics", "Michal Bassani-Sternberg", "University of Lausanne", "immunopeptidomics researcher", "Switzerland"],
  ["Antibody-drug conjugate payload biology", "biologics", "antibody-drug conjugates", "Peter D. Senter", "Seagen", "ADC researcher", "United States"],
  ["Bispecific antibody engineering", "biologics", "bispecific antibodies", "Paul Carter", "Genentech", "antibody engineering scientist", "United States"],
  ["Fc engineering for immune modulation", "biologics", "Fc biology", "Jeffrey V. Ravetch", "Rockefeller University", "immunology researcher", "United States"],
  ["Glycoengineering and biorthogonal chemistry", "chemical biology", "glycobiology", "Carolyn R. Bertozzi", "Stanford University", "chemical biology researcher", "United States"],
  ["Complement therapeutics", "immunology therapeutics", "complement biology", "John P. Atkinson", "Washington University in St. Louis", "complement biology researcher", "United States"],
  ["Autoimmune tolerance engineering", "immunology therapeutics", "immune tolerance", "Jeffrey A. Bluestone", "Sonoma Biotherapeutics / UCSF", "immunology researcher", "United States"],
  ["Regulatory T cell therapy", "cell therapy", "Treg therapy", "Megan K. Levings", "University of British Columbia", "Treg therapy researcher", "Canada"],
  ["Inflammation resolution biology", "immunology therapeutics", "specialized pro-resolving mediators", "Charles N. Serhan", "Brigham and Women's Hospital / Harvard Medical School", "inflammation resolution researcher", "United States"],
  ["Neuroimmune interfaces for repair", "neuroimmunology", "neuroimmune repair", "Michal Schwartz", "Weizmann Institute of Science", "neuroimmunology researcher", "Israel"],
  ["Blood-brain barrier delivery for genetic medicines", "neurotechnology delivery", "CNS delivery", "Viviana Gradinaru", "Caltech", "neurotechnology researcher", "United States"]
];

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function tag(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[_/]+/g, " ")
    .replace(/[^a-z0-9+.\-&\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function uniq(values) {
  return [...new Set(values.map(tag).filter(Boolean))];
}

function sourceUrls(personName, niche, institution) {
  const pubmed = encodeURIComponent(`${personName} ${niche}`);
  const profile = encodeURIComponent(`${personName} ${institution} profile`);
  return [
    `https://pubmed.ncbi.nlm.nih.gov/?term=${pubmed}`,
    `https://www.google.com/search?q=${profile}`
  ];
}

function topicBucket(domain) {
  const value = tag(domain);
  if (/genome|gene therapy|rna/.test(value)) return "genetic medicine";
  if (/cell therapy|cancer immunotherapy/.test(value)) return "cell therapy and immuno-oncology";
  if (/ai|computational|automation/.test(value)) return "ai-enabled discovery";
  if (/chemical|drug discovery|targeted protein|biologics/.test(value)) return "drug discovery modalities";
  if (/single-cell|spatial|genomics|diagnostics/.test(value)) return "omics and diagnostics";
  if (/organoid|stem cell|regenerative|tissue/.test(value)) return "regenerative medicine";
  if (/aging/.test(value)) return "aging and longevity";
  if (/microbiome|synthetic biology|protein engineering/.test(value)) return "synthetic biology and bioengineering";
  if (/immunology|neuroimmune|neurotechnology/.test(value)) return "immunology and CNS delivery";
  return "biotech r&d";
}

function buildExpert(row, index) {
  const [niche, domain, method, name, institution, archetype, geography] = row;
  const topicTags = uniq([topicBucket(domain), domain]);
  const tagGroups = {
    topic: topicTags,
    method: uniq([method]),
    domain: uniq([domain, "biotech r&d"]),
    geo: uniq([geography]),
    institution: uniq([institution]),
    archetype: uniq([archetype]),
    compliance: ["public sources only", "verify current affiliation", "no mnpi"],
    source: ["paper", "public profile"]
  };
  const tags = uniq(SELECTION_TAG_CATEGORIES.flatMap(key => tagGroups[key] || []));
  return {
    id: `bio-rd-${String(index + 1).padStart(3, "0")}-${slug(name)}`,
    name,
    cancerType: `Biotech R&D / ${niche}`,
    domain,
    geography,
    institution,
    archetype,
    likelyNetwork: "Direct",
    contactRoute: "Public institution/company profile, publication trail, or conference route; verify current role before outreach.",
    niche,
    approach: `Starting point for mapping state-of-the-art ${niche}. Use this as a lead, then verify recent publications, company conflicts, and availability before outreach.`,
    queryTerms: uniq([niche, domain, method, name, institution, "state of the art biotech r&d"]),
    tags,
    tagGroups,
    evidenceLinks: sourceUrls(name, niche, institution),
    questionsToAsk: [
      `What is the current technical bottleneck in ${niche}?`,
      "Which recent result changed your view of the field?",
      "Which teams or platforms are over- or under-estimated from public evidence?"
    ],
    complianceFlags: "Use public, sourceable information only. Verify current affiliation and conflicts before outreach. Do not ask for confidential company plans, unpublished data, patient details, or MNPI.",
    callValue: 700,
    scores: {
      relevance: 4,
      recency: 4,
      decision: 4,
      independence: 3,
      accessibility: 3,
      risk: -1
    },
    updatedAt: new Date().toISOString()
  };
}

async function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  const raw = await readFile(path, "utf8");
  return raw.trim() ? JSON.parse(raw) : fallback;
}

async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function main() {
  if (QUERIES.length < 100) throw new Error(`Expected at least 100 queries, found ${QUERIES.length}`);
  const existing = await readJson(DATA_FILE, []);
  const retained = existing.filter(expert => !String(expert.id || "").startsWith("bio-rd-"));
  const biotechExperts = QUERIES.map(buildExpert);
  const experts = [...retained, ...biotechExperts];
  const queryLog = QUERIES.map((row, index) => {
    const expert = biotechExperts[index];
    return {
      id: `biotech-rd-query-${String(index + 1).padStart(3, "0")}`,
      query: row[0],
      domain: row[1],
      method: row[2],
      status: "seeded",
      people: [{
        name: row[3],
        institution: row[4],
        archetype: row[5],
        geography: row[6],
        expertId: expert.id
      }],
      max_people_requested: 4,
      seeded_people: 1,
      updatedAt: expert.updatedAt
    };
  });

  await writeJson(DATA_FILE, experts);
  await writeJson(QUERY_FILE, queryLog);

  console.log(JSON.stringify({
    ok: true,
    queries: queryLog.length,
    biotechExperts: biotechExperts.length,
    totalExperts: experts.length,
    dataFile: DATA_FILE,
    queryFile: QUERY_FILE
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
