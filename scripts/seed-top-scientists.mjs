import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

const ROOT = resolve(".");
const DATA_FILE = join(ROOT, "data", "oncology-experts.json");
const QUERY_FILE = join(ROOT, "data", "top-scientists-queries.json");

const FIELD_SOURCES = {
  "AI": "https://aaai.org/about-aaai/aaai-awards/the-aaai-fellows-program/elected-aaai-fellows/",
  "Computer Science": "https://amturing.acm.org/byyear.cfm",
  "Neuroscience": "https://www.kavliprize.org/category/neuroscience",
  "Nanotechnology": "https://www.kavliprize.org/category/nanoscience"
};

const SELECTION_TAG_CATEGORIES = ["topic", "method", "domain", "geo", "archetype"];

const FIELDS = {
  "AI": [
    ["Yoshua Bengio", "deep learning representation learning", "deep learning", "Mila / Universite de Montreal", "Canada"],
    ["Geoffrey Hinton", "neural networks and representation learning", "deep learning", "University of Toronto", "Canada"],
    ["Yann LeCun", "convolutional networks and self-supervised learning", "deep learning", "New York University / Meta AI", "United States"],
    ["Andrew Ng", "machine learning education and applied AI", "applied machine learning", "Stanford University / DeepLearning.AI", "United States"],
    ["Fei-Fei Li", "computer vision and human-centered AI", "computer vision", "Stanford University", "United States"],
    ["Judea Pearl", "causal inference and probabilistic AI", "causal AI", "UCLA", "United States"],
    ["Stuart Russell", "AI safety and rational agents", "AI safety", "UC Berkeley", "United States"],
    ["Richard S. Sutton", "reinforcement learning foundations", "reinforcement learning", "University of Alberta", "Canada"],
    ["Andrew G. Barto", "reinforcement learning foundations", "reinforcement learning", "University of Massachusetts Amherst", "United States"],
    ["Michael I. Jordan", "statistical machine learning", "statistical ML", "UC Berkeley", "United States"],
    ["Leslie Valiant", "computational learning theory", "learning theory", "Harvard University", "United States"],
    ["Barbara Grosz", "multi-agent systems and natural language interaction", "multi-agent AI", "Harvard University", "United States"],
    ["Rodney Brooks", "robotics and embodied AI", "robotics", "MIT", "United States"],
    ["Cynthia Breazeal", "social robotics", "robotics", "MIT", "United States"],
    ["Sebastian Thrun", "autonomous vehicles and probabilistic robotics", "robotics", "Stanford University / Kitty Hawk", "United States"],
    ["Peter Norvig", "AI systems and applied AI", "AI systems", "Stanford Institute for Human-Centered AI", "United States"],
    ["Demis Hassabis", "AI for science and foundation models", "foundation models", "Google DeepMind", "United Kingdom"],
    ["David Silver", "deep reinforcement learning", "reinforcement learning", "Google DeepMind / UCL", "United Kingdom"],
    ["Ilya Sutskever", "large language models and sequence learning", "foundation models", "Safe Superintelligence / OpenAI", "United States"],
    ["Alex Krizhevsky", "deep convolutional neural networks", "computer vision", "University of Toronto / industry", "Canada"],
    ["Ian Goodfellow", "generative adversarial networks", "generative AI", "independent / industry", "United States"],
    ["Daphne Koller", "probabilistic AI and AI drug discovery", "AI for biology", "insitro / Stanford University", "United States"],
    ["Zoubin Ghahramani", "Bayesian machine learning", "probabilistic ML", "Google DeepMind / University of Cambridge", "United Kingdom"],
    ["Christopher M. Bishop", "probabilistic machine learning", "probabilistic ML", "Microsoft Research", "United Kingdom"],
    ["Bernhard Scholkopf", "kernel methods and causal representation learning", "machine learning theory", "Max Planck Institute for Intelligent Systems", "Germany"],
    ["Ruslan Salakhutdinov", "deep probabilistic models", "deep learning", "Carnegie Mellon University", "United States"],
    ["Pieter Abbeel", "robot learning", "robotics", "UC Berkeley", "United States"],
    ["Sergey Levine", "robot learning and offline RL", "robotics", "UC Berkeley", "United States"],
    ["Chelsea Finn", "meta-learning and robot learning", "robotics", "Stanford University", "United States"],
    ["Jitendra Malik", "computer vision and scene understanding", "computer vision", "UC Berkeley", "United States"],
    ["Trevor Darrell", "computer vision and multimodal learning", "computer vision", "UC Berkeley", "United States"],
    ["Kaiming He", "deep vision architectures", "computer vision", "MIT", "United States"],
    ["Ashish Vaswani", "transformer architectures", "foundation models", "Essential AI", "United States"],
    ["Noam Shazeer", "large-scale language models", "foundation models", "Google DeepMind", "United States"],
    ["Jakob Uszkoreit", "transformers and neural sequence models", "foundation models", "Inceptive / former Google Brain", "United States"],
    ["Oriol Vinyals", "sequence models and AI agents", "foundation models", "Google DeepMind", "United Kingdom"],
    ["Dan Jurafsky", "natural language processing", "NLP", "Stanford University", "United States"],
    ["Christopher Manning", "natural language processing and linguistics", "NLP", "Stanford University", "United States"],
    ["Percy Liang", "language models and AI agents", "NLP", "Stanford University", "United States"],
    ["Anca Dragan", "human-robot interaction and AI alignment", "human-compatible AI", "UC Berkeley", "United States"],
    ["Timnit Gebru", "AI ethics and dataset governance", "responsible AI", "Distributed AI Research Institute", "United States"],
    ["Joy Buolamwini", "algorithmic bias and AI accountability", "responsible AI", "Algorithmic Justice League / MIT", "United States"],
    ["Oren Etzioni", "AI systems and semantic search", "AI systems", "Allen Institute for AI", "United States"],
    ["Hugo Larochelle", "deep learning and representation learning", "deep learning", "Google DeepMind / Mila", "Canada"],
    ["Kyunghyun Cho", "neural machine translation and language models", "NLP", "New York University", "United States"],
    ["Yejin Choi", "commonsense AI and language models", "NLP", "Stanford University / University of Washington", "United States"],
    ["Dario Amodei", "frontier AI systems and safety", "AI safety", "Anthropic", "United States"],
    ["Samy Bengio", "deep learning systems", "deep learning", "Apple / former Google Brain", "United States"],
    ["Isabelle Guyon", "machine learning benchmarks and feature selection", "machine learning evaluation", "University Paris-Saclay / ChaLearn", "France"],
    ["Lydia E. Kavraki", "robot motion planning and AI for biomedicine", "robotics", "Rice University", "United States"]
  ],
  "Computer Science": [
    ["Tim Berners-Lee", "World Wide Web architecture", "web systems", "University of Oxford / MIT", "United Kingdom"],
    ["Vint Cerf", "internet architecture and TCP/IP", "networking", "Google", "United States"],
    ["Bob Kahn", "internet architecture and TCP/IP", "networking", "Corporation for National Research Initiatives", "United States"],
    ["Leslie Lamport", "distributed systems and temporal logic", "distributed systems", "Microsoft Research", "United States"],
    ["Barbara Liskov", "programming languages and distributed systems", "programming languages", "MIT", "United States"],
    ["Donald Knuth", "algorithms and computer science foundations", "algorithms", "Stanford University", "United States"],
    ["John Hopcroft", "automata theory and algorithms", "theory", "Cornell University", "United States"],
    ["Jeffrey Ullman", "compilers and database theory", "databases", "Stanford University", "United States"],
    ["Alfred Aho", "compilers and algorithms", "programming languages", "Columbia University", "United States"],
    ["Robert Tarjan", "graph algorithms and data structures", "algorithms", "Princeton University", "United States"],
    ["Shafi Goldwasser", "cryptography and complexity", "cryptography", "UC Berkeley / MIT / Weizmann Institute", "United States / Israel"],
    ["Silvio Micali", "cryptography and zero knowledge", "cryptography", "MIT", "United States"],
    ["Whitfield Diffie", "public-key cryptography", "cryptography", "industry / academia", "United States"],
    ["Martin Hellman", "public-key cryptography", "cryptography", "Stanford University", "United States"],
    ["Ronald Rivest", "cryptography and algorithms", "cryptography", "MIT", "United States"],
    ["Adi Shamir", "cryptography and security", "cryptography", "Weizmann Institute", "Israel"],
    ["Leonard Adleman", "cryptography and DNA computing", "cryptography", "University of Southern California", "United States"],
    ["Cynthia Dwork", "differential privacy", "privacy", "Harvard University / Microsoft Research", "United States"],
    ["Manuel Blum", "computational complexity and cryptography", "theory", "Carnegie Mellon University", "United States"],
    ["Michael Stonebraker", "database systems", "databases", "MIT", "United States"],
    ["David Patterson", "computer architecture and RISC", "computer architecture", "UC Berkeley / Google", "United States"],
    ["John Hennessy", "computer architecture and RISC", "computer architecture", "Stanford University", "United States"],
    ["Butler Lampson", "personal computing and distributed systems", "systems", "Microsoft Research", "United States"],
    ["Ed Catmull", "computer graphics and animation systems", "computer graphics", "Pixar / University of Utah", "United States"],
    ["Pat Hanrahan", "computer graphics and rendering", "computer graphics", "Stanford University", "United States"],
    ["Robert Metcalfe", "Ethernet and networking", "networking", "MIT / University of Texas at Austin", "United States"],
    ["Raj Reddy", "speech recognition and AI systems", "computer systems", "Carnegie Mellon University", "United States"],
    ["Andrew Yao", "computational complexity and secure computation", "theory", "Tsinghua University", "China"],
    ["Avi Wigderson", "complexity theory and randomness", "theory", "Institute for Advanced Study", "United States"],
    ["Laszlo Lovasz", "algorithms and graph theory", "theory", "Eotvos Lorand University", "Hungary"],
    ["Peter Shor", "quantum algorithms", "quantum computing", "MIT", "United States"],
    ["Charles H. Bennett", "quantum information and cryptography", "quantum computing", "IBM Research", "United States"],
    ["Gilles Brassard", "quantum cryptography", "quantum computing", "Universite de Montreal", "Canada"],
    ["Scott Aaronson", "quantum complexity theory", "quantum computing", "University of Texas at Austin", "United States"],
    ["Dan Boneh", "applied cryptography", "cryptography", "Stanford University", "United States"],
    ["Matei Zaharia", "data systems and ML infrastructure", "data systems", "UC Berkeley / Databricks", "United States"],
    ["Ion Stoica", "distributed systems and cloud computing", "distributed systems", "UC Berkeley / Databricks", "United States"],
    ["Jennifer Rexford", "internet routing and software-defined networking", "networking", "Princeton University", "United States"],
    ["Nick McKeown", "software-defined networking", "networking", "Stanford University", "United States"],
    ["Hari Balakrishnan", "networked systems", "networking", "MIT", "United States"],
    ["Nancy Lynch", "distributed algorithms", "distributed systems", "MIT", "United States"],
    ["Maurice Herlihy", "concurrent computing", "distributed systems", "Brown University", "United States"],
    ["Bjarne Stroustrup", "C++ and systems programming", "programming languages", "Columbia University", "United States"],
    ["Guido van Rossum", "Python programming language", "programming languages", "Microsoft / Python community", "United States"],
    ["Simon Peyton Jones", "functional programming and Haskell", "programming languages", "Epic Games / Microsoft Research", "United Kingdom"],
    ["Philip Wadler", "type systems and functional programming", "programming languages", "University of Edinburgh", "United Kingdom"],
    ["Xavier Leroy", "verified compilers and OCaml", "programming languages", "College de France / INRIA", "France"],
    ["Tim Roughgarden", "algorithmic game theory", "algorithms", "Columbia University", "United States"],
    ["Eva Tardos", "algorithms and algorithmic game theory", "algorithms", "Cornell University", "United States"],
    ["Sanjeev Arora", "complexity theory and optimization", "theory", "Princeton University", "United States"]
  ],
  "Neuroscience": [
    ["Ed Boyden", "optogenetics and neurotechnology", "neurotechnology", "MIT", "United States"],
    ["Karl Deisseroth", "optogenetics and brain circuits", "neurotechnology", "Stanford University", "United States"],
    ["May-Britt Moser", "grid cells and spatial navigation", "systems neuroscience", "NTNU", "Norway"],
    ["Edvard Moser", "grid cells and spatial navigation", "systems neuroscience", "NTNU", "Norway"],
    ["John O'Keefe", "place cells and hippocampal navigation", "systems neuroscience", "University College London", "United Kingdom"],
    ["David Julius", "sensory transduction and pain", "sensory neuroscience", "UCSF", "United States"],
    ["Ardem Patapoutian", "mechanosensation and ion channels", "sensory neuroscience", "Scripps Research", "United States"],
    ["Eve Marder", "neural circuits and neuromodulation", "systems neuroscience", "Brandeis University", "United States"],
    ["Cori Bargmann", "neural circuits and behavior", "systems neuroscience", "Rockefeller University", "United States"],
    ["Nancy Kanwisher", "human visual cognition", "cognitive neuroscience", "MIT", "United States"],
    ["Stanislas Dehaene", "consciousness and cognitive neuroscience", "cognitive neuroscience", "College de France", "France"],
    ["Karl Friston", "predictive coding and computational neuroscience", "computational neuroscience", "University College London", "United Kingdom"],
    ["Christof Koch", "consciousness neuroscience", "systems neuroscience", "Allen Institute / Tiny Blue Dot Foundation", "United States"],
    ["Gyorgy Buzsaki", "neural oscillations and hippocampal circuits", "systems neuroscience", "NYU Langone", "United States"],
    ["Michael E. Greenberg", "activity-dependent brain development", "molecular neuroscience", "Harvard Medical School", "United States"],
    ["Liqun Luo", "neural circuit development", "developmental neuroscience", "Stanford University", "United States"],
    ["Huda Zoghbi", "neurogenetics and Rett syndrome", "neurogenetics", "Baylor College of Medicine", "United States"],
    ["Thomas Sudhof", "synaptic transmission", "molecular neuroscience", "Stanford University", "United States"],
    ["Eric Kandel", "memory and synaptic plasticity", "molecular neuroscience", "Columbia University", "United States"],
    ["Richard Axel", "olfaction and neural coding", "sensory neuroscience", "Columbia University", "United States"],
    ["Linda Buck", "olfactory receptors and sensory coding", "sensory neuroscience", "Fred Hutchinson Cancer Center", "United States"],
    ["Susumu Tonegawa", "memory circuits and molecular neuroscience", "systems neuroscience", "MIT", "United States"],
    ["Carla Shatz", "activity-dependent brain development", "developmental neuroscience", "Stanford University", "United States"],
    ["Marcus Raichle", "default mode network and brain imaging", "human neuroscience", "Washington University in St. Louis", "United States"],
    ["Olaf Sporns", "connectomics and network neuroscience", "connectomics", "Indiana University", "United States"],
    ["Sebastian Seung", "connectomics and computational neuroscience", "connectomics", "Princeton University", "United States"],
    ["Jeff Lichtman", "connectomics and neural circuits", "connectomics", "Harvard University", "United States"],
    ["Winfried Denk", "connectomics imaging and microscopy", "connectomics", "Max Planck Institute", "Germany"],
    ["Rafael Yuste", "neurotechnology and brain activity maps", "neurotechnology", "Columbia University", "United States"],
    ["Misha Ahrens", "whole-brain activity imaging", "systems neuroscience", "HHMI Janelia", "United States"],
    ["Catherine Dulac", "social behavior circuits", "systems neuroscience", "Harvard University", "United States"],
    ["Elizabeth Phelps", "emotion, memory, and decision neuroscience", "cognitive neuroscience", "Harvard University", "United States"],
    ["Joseph LeDoux", "fear and emotion circuits", "affective neuroscience", "New York University", "United States"],
    ["Helen Mayberg", "depression circuits and neuromodulation", "clinical neuroscience", "Mount Sinai", "United States"],
    ["Nora Volkow", "addiction neuroscience", "clinical neuroscience", "National Institute on Drug Abuse", "United States"],
    ["Ann Graybiel", "basal ganglia and habit circuits", "systems neuroscience", "MIT", "United States"],
    ["Wolfram Schultz", "dopamine reward prediction", "systems neuroscience", "University of Cambridge", "United Kingdom"],
    ["Read Montague", "computational psychiatry", "computational neuroscience", "Virginia Tech", "United States"],
    ["Terry Sejnowski", "computational neuroscience", "computational neuroscience", "Salk Institute", "United States"],
    ["Larry Abbott", "theoretical neuroscience", "computational neuroscience", "Columbia University", "United States"],
    ["Emery Brown", "neural signal processing and anesthesia", "computational neuroscience", "MIT / Harvard Medical School", "United States"],
    ["Kay Tye", "motivational circuits and social behavior", "systems neuroscience", "Salk Institute", "United States"],
    ["Sheena Josselyn", "memory engrams", "systems neuroscience", "Hospital for Sick Children / University of Toronto", "Canada"],
    ["Alcino Silva", "memory allocation and cognition", "systems neuroscience", "UCLA", "United States"],
    ["Andres Lozano", "deep brain stimulation", "clinical neuroscience", "University of Toronto", "Canada"],
    ["Fred Gage", "adult neurogenesis and brain aging", "neuroregeneration", "Salk Institute", "United States"],
    ["Joshua Tenenbaum", "computational cognitive science", "computational neuroscience", "MIT", "United States"],
    ["Doris Tsao", "face perception circuits", "systems neuroscience", "UC Berkeley", "United States"],
    ["Michael Hausser", "dendritic computation", "systems neuroscience", "University College London", "United Kingdom"],
    ["Botond Roska", "retinal circuits and vision restoration", "neurotechnology", "Institute of Molecular and Clinical Ophthalmology Basel", "Switzerland"]
  ],
  "Nanotechnology": [
    ["Robert Langer", "nanomedicine and drug delivery", "nanomedicine", "MIT", "United States"],
    ["Paul Alivisatos", "quantum dots and nanocrystals", "nanomaterials", "University of Chicago / UC Berkeley", "United States"],
    ["Chad Mirkin", "spherical nucleic acids and nanofabrication", "nanomedicine", "Northwestern University", "United States"],
    ["George Whitesides", "self-assembled monolayers and soft lithography", "nanofabrication", "Harvard University", "United States"],
    ["Angela Belcher", "biomolecular materials and nanomanufacturing", "nanobiotechnology", "MIT", "United States"],
    ["Zhong Lin Wang", "nanogenerators and piezotronics", "nanomaterials", "Georgia Tech", "United States"],
    ["Charles M. Lieber", "semiconductor nanowires and nanoelectronics", "nanoelectronics", "Harvard University", "United States"],
    ["Peidong Yang", "semiconductor nanowires and artificial photosynthesis", "nanomaterials", "UC Berkeley", "United States"],
    ["Yi Cui", "nanomaterials for batteries", "energy nanotechnology", "Stanford University", "United States"],
    ["Paul McEuen", "carbon nanotubes and nanoscale devices", "nanoelectronics", "Cornell University", "United States"],
    ["Hongjie Dai", "carbon nanotubes and nanomedicine", "nanomaterials", "Stanford University", "United States"],
    ["Sumio Iijima", "carbon nanotubes", "nanomaterials", "Meijo University / NEC", "Japan"],
    ["Cees Dekker", "nanopores and DNA nanotechnology", "nanobiotechnology", "Delft University of Technology", "Netherlands"],
    ["Don Eigler", "atom manipulation and scanning tunneling microscopy", "nanoscience instrumentation", "IBM Research", "United States"],
    ["James R. Heath", "molecular electronics and nanomedicine", "nanomedicine", "Institute for Systems Biology", "United States"],
    ["Fraser Stoddart", "molecular machines", "molecular nanotechnology", "Northwestern University", "United States"],
    ["Jean-Pierre Sauvage", "molecular machines", "molecular nanotechnology", "University of Strasbourg", "France"],
    ["Ben Feringa", "molecular motors", "molecular nanotechnology", "University of Groningen", "Netherlands"],
    ["Moungi Bawendi", "quantum dots", "nanomaterials", "MIT", "United States"],
    ["Louis Brus", "quantum dots", "nanomaterials", "Columbia University", "United States"],
    ["Alexei Ekimov", "quantum dots", "nanomaterials", "Nanocrystals Technology Inc.", "United States"],
    ["Andre Geim", "graphene and 2D materials", "2D materials", "University of Manchester", "United Kingdom"],
    ["Konstantin Novoselov", "graphene and 2D materials", "2D materials", "National University of Singapore / University of Manchester", "Singapore / United Kingdom"],
    ["Michelle Simmons", "atomic-scale silicon quantum devices", "quantum nanotechnology", "UNSW Sydney", "Australia"],
    ["Evelyn Hu", "nanophotonics and semiconductor nanostructures", "nanophotonics", "Harvard University", "United States"],
    ["Mark Brongersma", "nanophotonics and plasmonics", "nanophotonics", "Stanford University", "United States"],
    ["Naomi Halas", "plasmonic nanostructures", "nanophotonics", "Rice University", "United States"],
    ["Jennifer Dionne", "nanophotonics and optical materials", "nanophotonics", "Stanford University", "United States"],
    ["Federico Capasso", "metasurfaces and nanophotonics", "nanophotonics", "Harvard University", "United States"],
    ["Nader Engheta", "metamaterials and nanophotonics", "nanophotonics", "University of Pennsylvania", "United States"],
    ["Aydogan Ozcan", "computational nanoscopy and diagnostics", "nanobiotechnology", "UCLA", "United States"],
    ["Zhenan Bao", "flexible electronics and electronic skin", "nanoelectronics", "Stanford University", "United States"],
    ["Xiaodong Xu", "2D quantum materials", "2D materials", "University of Washington", "United States"],
    ["Hongkun Park", "nanoscale materials and devices", "nanoelectronics", "Harvard University", "United States"],
    ["Xiaowei Zhuang", "super-resolution imaging and spatial biology", "nanobiotechnology", "Harvard University", "United States"],
    ["David Awschalom", "spintronics and quantum information", "quantum nanotechnology", "University of Chicago", "United States"],
    ["Ali Javey", "nanoelectronics and semiconductor devices", "nanoelectronics", "UC Berkeley", "United States"],
    ["John A. Rogers", "biointegrated electronics", "nanomedicine", "Northwestern University", "United States"],
    ["Michael Strano", "nanomaterials and nanosensors", "nanomaterials", "MIT", "United States"],
    ["Molly Stevens", "bioengineering and nanomedicine", "nanomedicine", "University of Oxford / Imperial College London", "United Kingdom"],
    ["Sangeeta Bhatia", "nanomedicine and tissue microtechnology", "nanomedicine", "MIT", "United States"],
    ["Tejal Desai", "nanomedicine and therapeutic microdevices", "nanomedicine", "Brown University", "United States"],
    ["Omid Farokhzad", "nanomedicine and drug delivery", "nanomedicine", "Seer / Harvard Medical School", "United States"],
    ["Joseph DeSimone", "3D nanofabrication and drug delivery", "nanofabrication", "Stanford University", "United States"],
    ["Karen Wooley", "polymer nanostructures", "nanomaterials", "Texas A&M University", "United States"],
    ["Jean Frechet", "polymer materials and nanostructures", "nanomaterials", "King Abdullah University of Science and Technology", "Saudi Arabia / United States"],
    ["Samuel Stupp", "self-assembling biomaterials", "nanomedicine", "Northwestern University", "United States"],
    ["Sharon Glotzer", "self-assembly and computational nanoscience", "nanomaterials", "University of Michigan", "United States"],
    ["Teri Odom", "nanophotonics and nanoscale materials", "nanophotonics", "Northwestern University", "United States"],
    ["Yury Gogotsi", "MXenes and nanomaterials", "2D materials", "Drexel University", "United States"]
  ]
};

function slug(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 100);
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

function evidenceLinks(field, person) {
  const query = encodeURIComponent(`${person[0]} ${person[1]} ${person[3]}`);
  return [
    FIELD_SOURCES[field],
    `https://scholar.google.com/scholar?q=${query}`,
    `https://www.google.com/search?q=${query}%20profile`
  ];
}

function record(field, row, index) {
  const [name, niche, method, institution, geography] = row;
  const fieldTag = tag(field);
  const domain = field === "AI" ? "artificial intelligence"
    : field === "Computer Science" ? "computer science"
      : field === "Neuroscience" ? "neuroscience"
        : "nanotechnology";
  const archetype = `${fieldTag} top 1 percent scientist`;
  const tagGroups = {
    topic: uniq(["top scientists", field, niche]),
    method: uniq([method]),
    domain: uniq([domain]),
    geo: uniq([geography]),
    institution: uniq([institution]),
    archetype: uniq([archetype]),
    compliance: ["public sources only", "verify current affiliation", "no mnpi"],
    source: ["award list", "scholar", "public profile"]
  };
  const tags = uniq(SELECTION_TAG_CATEGORIES.flatMap(key => tagGroups[key] || []));
  return {
    id: `top-${slug(field)}-${String(index + 1).padStart(3, "0")}-${slug(name)}`,
    name,
    cancerType: `Top Scientists / ${field} / ${niche}`,
    domain,
    geography,
    institution,
    archetype,
    likelyNetwork: "Direct",
    contactRoute: "Public profile, institutional office, conference route, or expert network verification; verify current affiliation before outreach.",
    niche,
    approach: `Top-tier ${field} lead for ${niche}. Use public publications, awards, talks, and lab pages to validate recency and conflict boundaries before outreach.`,
    queryTerms: uniq([name, field, niche, method, institution, "top 1 percent scientist"]),
    tags,
    tagGroups,
    evidenceLinks: evidenceLinks(field, row),
    questionsToAsk: [
      `What is the current state of the art in ${niche}?`,
      "Which recent result is most likely to change the field?",
      "Which public signals separate real technical leadership from hype?"
    ],
    complianceFlags: "Use public, sourceable information only. Verify current affiliation, conflicts, and availability. Do not ask for confidential lab, company, grant, patient, or MNPI information.",
    callValue: 1000,
    scores: {
      relevance: 5,
      recency: 4,
      decision: 5,
      independence: 4,
      accessibility: 2,
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
  const generated = Object.entries(FIELDS).flatMap(([field, rows]) => rows.map((row, index) => record(field, row, index)));
  const existing = await readJson(DATA_FILE, []);
  const retained = existing.filter(expert => !String(expert.id || "").startsWith("top-"));
  await writeJson(DATA_FILE, [...retained, ...generated]);
  await writeJson(QUERY_FILE, Object.fromEntries(Object.entries(FIELDS).map(([field, rows]) => [field, {
    field,
    requested: "top 1 percent",
    count: rows.length,
    source: FIELD_SOURCES[field]
  }])));
  console.log(JSON.stringify({
    ok: true,
    fields: Object.fromEntries(Object.entries(FIELDS).map(([field, rows]) => [field, rows.length])),
    added: generated.length,
    totalExperts: retained.length + generated.length,
    dataFile: DATA_FILE,
    queryFile: QUERY_FILE
  }, null, 2));
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
