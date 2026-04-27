export interface ManifestDocument {
  path: string;
  contentHash: string;
  mtimeMs: number;
  sizeBytes: number;
}

export interface Manifest {
  version: 1;
  generatedAt: string;
  documents: ManifestDocument[];
}

export interface ManifestDiff {
  added: ManifestDocument[];
  changed: ManifestDocument[];
  unchanged: ManifestDocument[];
  removed: ManifestDocument[];
}

export function createManifest(documents: ManifestDocument[], generatedAt = new Date()): Manifest {
  return {
    version: 1,
    generatedAt: generatedAt.toISOString(),
    documents: [...documents].sort((left, right) => left.path.localeCompare(right.path)),
  };
}

export function diffManifest(previous: Manifest | undefined, currentDocuments: ManifestDocument[]): ManifestDiff {
  const previousByPath = new Map((previous?.documents ?? []).map((document) => [document.path, document]));
  const currentByPath = new Map(currentDocuments.map((document) => [document.path, document]));

  const added: ManifestDocument[] = [];
  const changed: ManifestDocument[] = [];
  const unchanged: ManifestDocument[] = [];
  const removed: ManifestDocument[] = [];

  for (const document of currentDocuments) {
    const previousDocument = previousByPath.get(document.path);

    if (!previousDocument) {
      added.push(document);
      continue;
    }

    if (previousDocument.contentHash !== document.contentHash || previousDocument.sizeBytes !== document.sizeBytes) {
      changed.push(document);
      continue;
    }

    unchanged.push(document);
  }

  for (const document of previous?.documents ?? []) {
    if (!currentByPath.has(document.path)) {
      removed.push(document);
    }
  }

  return { added, changed, unchanged, removed };
}

export function isManifest(value: unknown): value is Manifest {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<Manifest>;
  return candidate.version === 1
    && typeof candidate.generatedAt === 'string'
    && Array.isArray(candidate.documents)
    && candidate.documents.every(isManifestDocument);
}

function isManifestDocument(value: unknown): value is ManifestDocument {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const candidate = value as Partial<ManifestDocument>;
  return typeof candidate.path === 'string'
    && typeof candidate.contentHash === 'string'
    && typeof candidate.mtimeMs === 'number'
    && typeof candidate.sizeBytes === 'number';
}
