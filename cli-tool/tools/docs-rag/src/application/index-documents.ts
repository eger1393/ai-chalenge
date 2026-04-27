import { createManifest, diffManifest, type Manifest, type ManifestDiff, type ManifestDocument } from '../domain/manifest.js';
import type { DocsRagConfig } from '../domain/config.js';
import { chunkMarkdownDocument } from '../domain/markdown-chunker.js';
import type { Chunk, SourceDocument } from '../domain/document.js';
import { embedMissingChunks, type EmbeddingProvider, type ChunkEmbeddingStorage } from './embed-chunks.js';

export interface DocumentDiscovery {
  discoverDocuments(projectRoot: string, config: DocsRagConfig): Promise<ManifestDocument[]>;
}

export interface ManifestRepository {
  readManifest(projectRoot: string): Promise<Manifest | undefined>;
  writeManifest(projectRoot: string, manifest: Manifest): Promise<string>;
}

export interface DocumentReader {
  readDocument(projectRoot: string, document: ManifestDocument): Promise<SourceDocument>;
}

export interface ChunkStorage {
  replaceChunks(projectRoot: string, documents: ManifestDocument[], chunks: Chunk[]): Promise<string>;
}

export interface IndexDocumentsResult {
  manifestPath: string;
  indexPath: string;
  total: number;
  chunkCount: number;
  embeddedCount: number;
  chunks: Chunk[];
  diff: ManifestDiff;
}

export async function indexDocuments(
  discovery: DocumentDiscovery,
  manifestRepository: ManifestRepository,
  documentReader: DocumentReader,
  chunkStorage: ChunkStorage & ChunkEmbeddingStorage,
  embeddingProvider: EmbeddingProvider,
  projectRoot: string,
  config: DocsRagConfig,
): Promise<IndexDocumentsResult> {
  const previousManifest = await manifestRepository.readManifest(projectRoot);
  const documents = await discovery.discoverDocuments(projectRoot, config);
  const sourceDocuments = await Promise.all(documents.map((document) => documentReader.readDocument(projectRoot, document)));
  const chunks = sourceDocuments.flatMap((document) => chunkMarkdownDocument(document, config.chunking));
  const diff = diffManifest(previousManifest, documents);
  const manifest = createManifest(documents);
  const manifestPath = await manifestRepository.writeManifest(projectRoot, manifest);
  const indexPath = await chunkStorage.replaceChunks(projectRoot, documents, chunks);
  const embeddingResult = await embedMissingChunks(chunkStorage, embeddingProvider, projectRoot, config.embeddings.model);

  return {
    manifestPath,
    indexPath,
    total: documents.length,
    chunkCount: chunks.length,
    embeddedCount: embeddingResult.embedded,
    chunks,
    diff,
  };
}
