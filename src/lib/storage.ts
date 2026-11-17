import AsyncStorage from "@react-native-async-storage/async-storage";

const KEYS = {
  apiKey: "hb_api_key",
  bibleId: "hb_bible_id",
  bookmarks: "hb_bookmarks",
  history: "hb_history",
  notes: "hb_notes",
  highlights: "hb_highlights",
  fontSize: "hb_font_size",
  readingPlan: "hb_reading_plan",
  noteLibrary: "hb_note_library"
};

export type SavedReference = { id: string; reference: string; bookId: string; chapter: number; verse?: number; createdAt: number };

export type ReadingPlanProgress = { planId: string; startDate: string; completedChapters: string[]; updatedAt: number };

export type BibleNoteKind = "personal" | "verse" | "study";
export type NoteReference = {
  bookId: string;
  bookHindi: string;
  bookEnglish: string;
  chapter: number;
  verse?: number;
};
export type BibleNote = {
  id: string;
  title: string;
  content: string;
  kind: BibleNoteKind;
  tags: string[];
  reference?: NoteReference;
  createdAt: number;
  updatedAt: number;
};

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
  getNoteLibrary: () => readJSON<BibleNote[]>(KEYS.noteLibrary, []),
  setNoteLibrary: (value: BibleNote[]) => AsyncStorage.setItem(KEYS.noteLibrary, JSON.stringify(value)),
  getHighlights: () => readJSON<Record<string,string>>(KEYS.highlights, {}),
  setHighlights: (value: Record<string,string>) => AsyncStorage.setItem(KEYS.highlights, JSON.stringify(value)),
  getFontSize: async () => Number(await AsyncStorage.getItem(KEYS.fontSize)) || 19,
  setFontSize: (value: number) => AsyncStorage.setItem(KEYS.fontSize, String(value)),
  getReadingPlan: () => readJSON<ReadingPlanProgress | null>(KEYS.readingPlan, null),
  setReadingPlan: (value: ReadingPlanProgress) => AsyncStorage.setItem(KEYS.readingPlan, JSON.stringify(value)),
  clearReadingPlan: () => AsyncStorage.removeItem(KEYS.readingPlan)
};
