import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { seedTemplates } from '../shared/seeds';
import type { TemplateRecord } from '../shared/model';

/** One writer queue prevents lost updates; rename commits a complete JSON snapshot. */
export class TemplateStore {
  private records: TemplateRecord[] = [];
  private queue: Promise<unknown>;
  private ready: Promise<void>;
  private file: string;
  constructor(dataDir: string) {
    this.file = path.join(path.resolve(dataDir), 'templates.json');
    this.ready = this.load();
    this.queue = this.ready;
    // Preserve initialization failure for every operation without an unhandled rejection.
    void this.ready.catch(() => undefined);
  }
  private async load() {
    await mkdir(path.dirname(this.file), { recursive: true });
    try {
      const parsed: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      if (
        !Array.isArray(parsed) ||
        !parsed.every((r) => r && typeof r.id === 'string' && Array.isArray(r.versions))
      )
        throw new Error('Некорректный файл templates.json. Автоматический сброс отключён.');
      this.records = parsed as TemplateRecord[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.records = structuredClone(seedTemplates);
      await this.persist(this.records);
    }
  }
  private async persist(records: TemplateRecord[]) {
    const temporary = `${this.file}.${randomUUID()}.tmp`;
    await writeFile(temporary, JSON.stringify(records, null, 2), 'utf8');
    await rename(temporary, this.file);
  }
  async read(): Promise<TemplateRecord[]> {
    await this.ready;
    await this.queue;
    return structuredClone(this.records);
  }
  async mutate<T>(operation: (records: TemplateRecord[]) => T): Promise<T> {
    const pending = this.queue.then(async () => {
      await this.ready;
      const next = structuredClone(this.records);
      const result = operation(next);
      await this.persist(next);
      this.records = next;
      return structuredClone(result);
    });
    this.queue = pending.catch(() => undefined);
    return pending;
  }
}
