import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  apiKey: "hb_api_key",
  bibleId: "hb_bible_id",
  bookmarks: "hb_bookmarks",
  history: "hb_history",
  notes: "hb_notes",
  fontSize: "hb_font_size"
};

export type SavedReference = { id: string; reference: string; bookId: string; chapter: number; createdAt: number };

async function readJSON<T>(key: string, fallback: T): Promise<T> {
  try { const value = await AsyncStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; }
  catch { return fallback; }
}

export const storage = {
  getApiKey: () => AsyncStorage.getItem(KEYS.apiKey),
  setApiKey: (value: string) => AsyncStorage.setItem(KEYS.apiKey, value.trim()),
  getBibleId: async () => (await AsyncStorage.getItem(KEYS.bibleId)) || "",
  setBibleId: (value: string) => AsyncStorage.setItem(KEYS.bibleId, value),
  getBookmarks: () => readJSON<SavedReference[]>(KEYS.bookmarks, []),
  setBookmarks: (value: SavedReference[]) => AsyncStorage.setItem(KEYS.bookmarks, JSON.stringify(value)),
  getHistory: () => readJSON<SavedReference[]>(KEYS.history, []),
  setHistory: (value: SavedReference[]) => AsyncStorage.setItem(KEYS.history, JSON.stringify(value)),
  getNotes: () => readJSON<Record<string,string>>(KEYS.notes, {}),
  setNotes: (value: Record<string,string>) => AsyncStorage.setItem(KEYS.notes, JSON.stringify(value)),
  getFontSize: async () => Number(await AsyncStorage.getItem(KEYS.fontSize)) || 19,
  setFontSize: (value: number) => AsyncStorage.setItem(KEYS.fontSize, String(value))
};
