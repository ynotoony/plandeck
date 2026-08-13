export type Status = "matched" | "unknown" | "unset" | "oauth";

export interface SessionState {
  id: string;
  model: string;
  plan?: string;
  status: Status;
  when: string;
}

export interface ProjectState {
  name: string;
  path: string;
  sessions: SessionState[];
}

export interface ToolState {
  toolId: string;
  status: Status;
  defaultModel?: string;
  plan?: string;
  baseUrl?: string;
  note?: string;
  projects: ProjectState[];
}

export interface FileEdit {
  path: string;
  oldText: string;
  newText: string;
}

export type PlanSource = "env" | "config" | "oauth";

export interface Plan {
  id: string;
  name: string;
  source: PlanSource;
  sourceDetail?: string;
  providerId?: string;
  baseUrl?: string;
  key?: string;
  credentialFingerprint?: string;
  models: string[];
  note?: string;
}

export interface Catalog {
  version: 1;
  plans: Plan[];
}

export interface ConfigFragment {
  baseUrl?: string;
  model?: string;
  providerId?: string;
  key?: string;
}

export interface FsPort {
  exists(path: string): Promise<boolean>;
  read(path: string): Promise<string>;
  write(path: string, text: string, opts?: { mode?: number }): Promise<void>;
  list(path: string): Promise<string[]>;
  isDirectory(path: string): Promise<boolean>;
  mtime(path: string): Promise<number | undefined>;
}

export interface SqlitePort {
  query(path: string, sql: string, params?: (string | number | null)[]): Promise<Record<string, unknown>[]>;
}

export interface Adapter {
  toolId: string;
  toolName: string;
  configPath: string;
  readState(): Promise<ToolState>;
  readFragment(): Promise<ConfigFragment | null>;
  planChange(plan: Plan, model: string): Promise<FileEdit[]>;
}

export interface AdapterContext {
  fs: FsPort;
  sqlite: SqlitePort;
  homeDir: string;
  catalog: Catalog;
}
