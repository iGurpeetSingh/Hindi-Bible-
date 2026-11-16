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
  availableFormats?: string[];
  listOfBooksApiLink?: string;
  simpleCompleteTranslationApiLink?: string;
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

export type BibleSearchVerse = {
  reference: string;
  bookId: string;
  bookName: string;
  chapter: number;
  verse: number;
  text: string;
};

type CompleteSimpleResponse = {
  books?: {
    id: string;
    name?: string;
    commonName?: string;
    chapters?: {
      chapter?: {
        number?: number;
        content?: { type: string; number?: number; text?: string }[];
      };
    }[];
  }[];
};

const completeSearchCache = new Map<string, Promise<BibleSearchVerse[]>>();

function normalizeSearchText(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * AO Lab does not publish a dedicated full-text search endpoint.
 * Its complete.simple.json download contains every book/chapter/verse,
 * so download it once per translation per app session and search locally.
 */
export async function searchBibleText(
  translationId: string,
  query: string,
  limit = 100
): Promise<BibleSearchVerse[]> {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return [];

  let indexPromise = completeSearchCache.get(translationId);
  if (!indexPromise) {
    indexPromise = request<CompleteSimpleResponse>(`/${encodeURIComponent(translationId)}/complete.simple.json`)
      .then(data => {
        const verses: BibleSearchVerse[] = [];
        for (const book of data.books || []) {
          for (const chapterEntry of book.chapters || []) {
            const chapter = chapterEntry.chapter;
            const chapterNumber = Number(chapter?.number);
            if (!Number.isInteger(chapterNumber) || chapterNumber < 1) continue;
            for (const item of chapter?.content || []) {
              if (item.type !== "verse" || typeof item.number !== "number" || !item.text) continue;
              verses.push({
                reference: `${book.id}.${chapterNumber}.${item.number}`,
                bookId: book.id,
                bookName: book.commonName || book.name || book.id,
                chapter: chapterNumber,
                verse: item.number,
                text: item.text
              });
            }
          }
        }
        if (!verses.length) throw new Error("इस अनुवाद का पूरा Bible Text Search के लिए उपलब्ध नहीं है।");
        return verses;
      })
      .catch(error => {
        completeSearchCache.delete(translationId);
        throw error;
      });
    completeSearchCache.set(translationId, indexPromise);
  }

  const allVerses = await indexPromise;
  const terms = normalizedQuery.split(" ").filter(Boolean);
  return allVerses
    .filter(verse => {
      const text = normalizeSearchText(verse.text);
      return text.includes(normalizedQuery) || (terms.length > 1 && terms.every(term => text.includes(term)));
    })
    .slice(0, Math.max(1, limit));
}

type TranslationResponse = { translations: (ApiBible & { languageEnglishName?: string })[] };
type BooksResponse = { books: { id: string; name: string; commonName?: string; numberOfChapters: number }[] };
type ChapterResponse = {
  translation?: ApiBible;
  book?: { id?: string; name?: string; commonName?: string };
  chapter?: { number?: number; content?: { type: string; number?: number; text?: string; heading?: string }[] };
};

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${BASE}${path}`);
  const contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    const detail = contentType.includes("json")
      ? (await response.text().catch(() => "")).slice(0, 180)
      : "";
    if (response.status === 404 && (!contentType.includes("json") || contentType.includes("html"))) {
      throw new Error(`Bible API 404: यह Translation या अध्याय API पर उपलब्ध नहीं है। Requested path: ${path}`);
    }
    throw new Error(`Bible API error ${response.status}: ${detail || response.statusText}`);
  }
  if (contentType.includes("text/html")) {
    throw new Error(`Bible API ने JSON के बजाय HTML पेज लौटाया। Translation या अध्याय URL जाँचें: ${path}`);
  }
  try {
    return await response.json() as T;
  } catch {
    throw new Error(`Bible API से मान्य JSON नहीं मिला: ${path}`);
  }
}

// No API key, account, or payment is required by this provider.
function isHindiLanguageName(value?: string): boolean {
  const normalized = (value || "").trim().toLocaleLowerCase();
  return normalized === "hindi"
    || normalized === "हिंदी"
    || normalized === "हिन्दी"
    || normalized.startsWith("hindi ")
    || normalized.startsWith("hindi(")
    || normalized.startsWith("hindi-");
}

function isHindiTranslation(translation: ApiBible & { languageEnglishName?: string }): boolean {
  const languageCode = (translation.language || "").trim().toLowerCase();
  const languageTag = (translation.language_tag || "").trim().toLowerCase();
  const hasHindiCode = languageCode === "hin"
    || languageCode === "hi"
    || languageTag === "hin"
    || languageTag === "hi"
    || languageTag.startsWith("hi-");
  const hasExactHindiName = isHindiLanguageName(translation.languageName)
    || isHindiLanguageName(translation.languageEnglishName);
  return hasHindiCode || hasExactHindiName;
}

async function hasUsableHindiBibleApi(translation: ApiBible): Promise<boolean> {
  try {
    if (!translation.id || !/^[a-zA-Z0-9_-]+$/.test(translation.id)) return false;
    if (translation.availableFormats?.length && !translation.availableFormats.includes("json")) return false;

    // A Hindi title/language tag alone is not enough: confirm the API really
    // serves the canonical book list and an actual chapter for this exact ID.
    const id = encodeURIComponent(translation.id);
    const books = await request<BooksResponse>(`/${id}/books.json`);
    if (!(books.books || []).some(book => book.id === "GEN")) return false;

    const genesis = await request<ChapterResponse>(`/${id}/GEN/1.simple.json`);
    return (genesis.chapter?.content || []).some(
      item => item.type === "verse" && typeof item.number === "number" && !!item.text?.trim()
    );
  } catch {
    return false;
  }
}

export async function getHindiBibles(_unusedKey = ""): Promise<ApiBible[]> {
  const result = await request<TranslationResponse>("/available_translations.json");
  const candidates = (result.translations || []).filter(isHindiTranslation);
  const verified = await Promise.all(
    candidates.map(async translation => (await hasUsableHindiBibleApi(translation)) ? translation : null)
  );
  return verified
    .filter((translation): translation is ApiBible => translation !== null)
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

export async function getPassage(_unusedKey: string, bibleId: string, passageId: string): Promise<{id:string;content:string;reference:string;copyright?:string}> {
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
