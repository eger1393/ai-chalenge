export interface ProjectContextSnippet {
  source: string;
  title: string;
  content: string;
}

export interface LorexContextConfig {
  enabled: boolean;
  project_root: string;
  cli_path: string;
  max_chunks: number;
  max_bytes: number;
}

export interface ProjectContextConfig {
  lorex?: LorexContextConfig;
}
