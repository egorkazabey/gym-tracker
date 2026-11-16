// Thin wrapper over Telegram WebApp API with a localStorage fallback for plain-browser development.

type Cb<T> = (err: string | null, value?: T) => void;

interface TgCloudStorage {
  setItem(key: string, value: string, cb?: Cb<boolean>): void;
  getItem(key: string, cb: Cb<string>): void;
  getItems(keys: string[], cb: Cb<Record<string, string>>): void;
  removeItem(key: string, cb?: Cb<boolean>): void;
  removeItems(keys: string[], cb?: Cb<boolean>): void;
  getKeys(cb: Cb<string[]>): void;
}

interface TgButton {
  setText(t: string): TgButton;
  show(): TgButton;
  hide(): TgButton;
  onClick(fn: () => void): TgButton;
  offClick(fn: () => void): TgButton;
  setParams?(p: Record<string, unknown>): TgButton;
}

interface TgWebApp {
  initData: string;
  version: string;
  platform: string;
  ready(): void;
  expand(): void;
  isVersionAtLeast(v: string): boolean;
  setHeaderColor?(c: string): void;
  setBackgroundColor?(c: string): void;
  setBottomBarColor?(c: string): void;
  disableVerticalSwipes?(): void;
  enableClosingConfirmation?(): void;
  disableClosingConfirmation?(): void;
  showConfirm?(msg: string, cb: (ok: boolean) => void): void;
  CloudStorage: TgCloudStorage;
  MainButton: TgButton;
  BackButton: TgButton;
  HapticFeedback?: {
    impactOccurred(s: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft'): void;
    notificationOccurred(s: 'error' | 'success' | 'warning'): void;
    selectionChanged(): void;
  };
  initDataUnsafe?: { user?: { first_name?: string } };
}

declare global {
  interface Window {
    Telegram?: { WebApp: TgWebApp };
  }
}

export const tg: TgWebApp | undefined =
  typeof window !== 'undefined' && window.Telegram?.WebApp?.initData ? window.Telegram.WebApp : undefined;

export const inTelegram = !!tg;
const cloudOk = !!tg && tg.isVersionAtLeast('6.9');

export function initTelegram() {
  if (!tg) return;
  tg.ready();
  tg.expand();
  try {
    tg.setHeaderColor?.('#0B0B0F');
    tg.setBackgroundColor?.('#0B0B0F');
    tg.setBottomBarColor?.('#0B0B0F');
    tg.disableVerticalSwipes?.();
  } catch {
    /* older clients */
  }
}

export const haptic = {
  tap: () => tg?.HapticFeedback?.impactOccurred('light'),
  medium: () => tg?.HapticFeedback?.impactOccurred('medium'),
  success: () => tg?.HapticFeedback?.notificationOccurred('success'),
  select: () => tg?.HapticFeedback?.selectionChanged(),
};

export function confirmDialog(msg: string): Promise<boolean> {
  if (tg?.showConfirm && tg.isVersionAtLeast('6.2')) {
    return new Promise((res) => tg!.showConfirm!(msg, res));
  }
  return Promise.resolve(window.confirm(msg));
}

// ---------- Key/value storage ----------

export const MAX_KEYS = 1024;
export const MAX_VALUE = 4096;
const LS_PREFIX = 'gymkv_';

function p<T>(fn: (cb: Cb<T>) => void): Promise<T> {
  return new Promise((resolve, reject) =>
    fn((err, v) => (err ? reject(new Error(err)) : resolve(v as T))),
  );
}

export interface KV {
  get(key: string): Promise<string | null>;
  getMany(keys: string[]): Promise<Record<string, string>>;
  set(key: string, value: string): Promise<void>;
  remove(keys: string[]): Promise<void>;
  keys(): Promise<string[]>;
}

const cloudKV: KV = {
  async get(key) {
    const v = await p<string>((cb) => tg!.CloudStorage.getItem(key, cb));
    return v ? v : null;
  },
  async getMany(keys) {
    const out: Record<string, string> = {};
    for (let i = 0; i < keys.length; i += 25) {
      const part = await p<Record<string, string>>((cb) =>
        tg!.CloudStorage.getItems(keys.slice(i, i + 25), cb),
      );
      for (const [k, v] of Object.entries(part)) if (v) out[k] = v;
    }
    return out;
  },
  async set(key, value) {
    await p<boolean>((cb) => tg!.CloudStorage.setItem(key, value, cb));
  },
  async remove(keys) {
    if (keys.length) await p<boolean>((cb) => tg!.CloudStorage.removeItems(keys, cb));
  },
  keys: () => p<string[]>((cb) => tg!.CloudStorage.getKeys(cb)),
};

const localKV: KV = {
  async get(key) {
    return localStorage.getItem(LS_PREFIX + key);
  },
  async getMany(keys) {
    const out: Record<string, string> = {};
    for (const k of keys) {
      const v = localStorage.getItem(LS_PREFIX + k);
      if (v) out[k] = v;
    }
    return out;
  },
  async set(key, value) {
    if (value.length > MAX_VALUE) throw new Error('value too long');
    localStorage.setItem(LS_PREFIX + key, value);
  },
  async remove(keys) {
    keys.forEach((k) => localStorage.removeItem(LS_PREFIX + k));
  },
  async keys() {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(LS_PREFIX))
      .map((k) => k.slice(LS_PREFIX.length));
  },
};

export const kv: KV = cloudOk ? cloudKV : localKV;
