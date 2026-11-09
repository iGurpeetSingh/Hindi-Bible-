import { BOOKS } from "../data/books";

const BASE = "https://bible.helloao.org/api";

export type ApiBible = {
  id: string;
  title: string;
  name?: string;
  localized_title?: string;
  localized_abbreviation?: string;
  abbreviation?: string;
  copyright?: string;
  publisher_name?: string | null;
  language_tag?: string;
  language?: string;
  languageName?: string;
  numberOfBooks?: number;
  totalNumberOfChapters?: number;
  licenseUrl?: string;
  licenseNotice?: string;
  license?: { commercialUse?: "allowed" | "not-allowed"; derivatives?: "allowed" | "not-allowed" };
};

export type ApiIndexBook = {
  id: string;
  title: string;
  canon: string;
  chapters: { id: number | string; passage_id: string; title: number | string }[];
};

export type SearchVerse = { reference: string; passage_id?: string };

type TranslationResponse = { translations: (ApiBible & { languageEnglishName?: string })[] };
type BooksResponse = { books: { id: string; name: string; commonName?: string; numberOfChapters: number }[] };
type ChapterResponse = {
  translation?: ApiBible;
  book?: { id?: string; name?: string; commonName?: string };
  chapter?: { number?: number; content?: { type: string; number?: number; text?: string; heading?: string }[] };
};

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`);
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Free Bible API error ${response.status}: ${detail || response.statusText}`);
  }
  return response.json() as Promise<T>;
}

// No API key, account, or payment is required by this provider.
export async function getHindiBibles(_unusedKey = ""): Promise<ApiBible[]> {
  const result = await request<TranslationResponse>("/available_translations.json");
  return (result.translations || [])
    .filter(t => {
      const language = `${t.language || ""} ${t.languageName || ""} ${t.languageEnglishName || ""}`.toLowerCase();
      return language.includes("hin") || language.includes("hindi") || language.includes("हिन्दी") || language.includes("हिंदी");
    })
    .map(t => ({ ...t, title: t.name || t.title || t.id }));
}

export async function getBibleIndex(_unusedKey: string, bibleId: string): Promise<ApiIndexBook[]> {
  const result = await request<BooksResponse>(`/${encodeURIComponent(bibleId)}/books.json`);
  return (result.books || []).filter(b => !b.id.startsWith("TOC")).map(b => ({
    id: b.id,
    title: b.commonName || b.name,
    canon: "canonical",
    chapters: Array.from({ length: b.numberOfChapters || 0 }, (_, i) => ({
      id: i + 1,
      passage_id: `${b.id}.${i + 1}`,
      title: i + 1
    }))
  }));
}

export async function getPassage(_unusedKey: string, bibleId: string, passageId: string): Promise<{id:string;content:string;reference:string}> {
  const parts = passageId.split(".");
  const bookId = parts[0];
  const chapterNumber = Number(parts[1]);
  const verseNumber = parts[2] ? Number(parts[2]) : null;
  if (!bookId || !Number.isInteger(chapterNumber) || chapterNumber < 1) {
    throw new Error("अध्याय का reference सही नहीं है।");
  }
  const result = await request<ChapterResponse>(`/${encodeURIComponent(bibleId)}/${encodeURIComponent(bookId)}/${chapterNumber}.simple.json`);
  const content = result.chapter?.content || [];
  const verses = content
    .filter(item => item.type === "verse" && typeof item.number === "number")
    .filter(item => verseNumber === null || item.number === verseNumber)
    .map(item => verseNumber === null ? `${item.number}. ${item.text || ""}` : item.text || "");
  if (!verses.length) throw new Error("इस अनुवाद में यह अध्याय या वचन उपलब्ध नहीं है।");
  const bookName = result.book?.commonName || result.book?.name || bookId;
  const reference = verseNumber === null ? `${bookName} ${chapterNumber}` : `${bookName} ${chapterNumber}:${verseNumber}`;
  return { id: passageId, content: verses.join("\n\n"), reference, copyright: result.translation?.licenseNotice || result.translation?.copyright || "" };
}

// The provider has no global full-text search endpoint. This supports exact
// scripture-reference lookup without pretending to search every verse by keyword.
export async function searchVerses(_unusedKey: string, _bibleId: string, query: string): Promise<SearchVerse[]> {
  const input = query.trim();
  const dotMatch = input.match(/^([1-3]?[A-Z]{2,3})\.(\d+)(?:\.(\d+))?$/i);
  const namedMatch = input.match(/^(.+?)\s+(\d+)(?::(\d+))?$/);
  let book: typeof BOOKS[number] | undefined;
  let chapter = 0;
  let verse: number | undefined;
  if (dotMatch) {
    book = BOOKS.find(b => b.id.toLowerCase() === dotMatch[1].toLowerCase());
    chapter = Number(dotMatch[2]);
    verse = dotMatch[3] ? Number(dotMatch[3]) : undefined;
  } else if (namedMatch) {
    const name = namedMatch[1].trim().toLocaleLowerCase();
    book = BOOKS.find(b => b.id.toLowerCase() === name || b.english.toLocaleLowerCase() === name || b.hindi.toLocaleLowerCase() === name);
    chapter = Number(namedMatch[2]);
    verse = namedMatch[3] ? Number(namedMatch[3]) : undefined;
  }
  if (!book || !Number.isInteger(chapter) || chapter < 1 || chapter > book.chapters || (verse !== undefined && (!Number.isInteger(verse) || verse < 1))) {
    throw new Error("अभी Reference Search उपलब्ध है। उदाहरण: John 3:16, यूहन्ना 3:16 या JHN.3.16 लिखें।");
  }
  return [{ reference: `${book.id}.${chapter}${verse ? `.${verse}` : ""}` }];
}
