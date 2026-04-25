export interface StorageAdapter {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T): Promise<void>;
  remove(key: string): Promise<void>;
}

export class InMemoryStorageAdapter implements StorageAdapter {
  private readonly store = new Map<string, string>();

  async get<T>(key: string): Promise<T | null> {
    const value = this.store.get(key);
    if (!value) {
      return null;
    }
    return JSON.parse(value) as T;
  }

  async set<T>(key: string, value: T): Promise<void> {
    this.store.set(key, JSON.stringify(value));
  }

  async remove(key: string): Promise<void> {
    this.store.delete(key);
  }
}

