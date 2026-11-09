const BASE = "https://api.youversion.com/v1";

export type ApiBible = {
  id: number;
  title: string;
  localized_title?: string;
  localized_abbreviation?: string;
  abbreviation?: string;
  copyright?: string;
  publisher_name?: string | null;
  language_tag?: string;
};

export type ApiIndexBook = {
  id: string;
  title: string;
  canon: string;
  chapters: { id: number | string; passage_id: string; title: number | string }[];
};

export type SearchVerse = { reference: string; passage_id?: string };

async function request<T>(path: string, appKey: string): Promise<T> {
  if (!appKey.trim()) throw new Error("पहले Settings में YouVersion App Key जोड़ें।");
  const response = await fetch(`${BASE}${path}`, {
    headers: { "X-YVP-App-Key": appKey.trim(), Accept: "application/json" }
  });
  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    throw new Error(`Bible API error ${response.status}: ${detail || response.statusText}`);
  }
  return response.json() as Promise<T>;
}

export async function getHindiBibles(key: string): Promise<ApiBible[]> {
  const result = await request<{data: ApiBible[]}>("/bibles?language_ranges%5B%5D=hi&page_size=99", key);
  return result.data ?? [];
}

export async function getBibleIndex(key: string, bibleId: number): Promise<ApiIndexBook[]> {
  const result = await request<{books: ApiIndexBook[]}>(`/bibles/${bibleId}/index`, key);
  return result.books ?? [];
}

export async function getPassage(key: string, bibleId: number, passageId: string): Promise<{id:string;content:string;reference:string}> {
  return request(`/bibles/${bibleId}/passages/${encodeURIComponent(passageId)}?format=text`, key);
}

export async function searchVerses(key: string, bibleId: number, query: string): Promise<SearchVerse[]> {
  const params = new URLSearchParams({query, bible_id:String(bibleId), user_intent:"unknown", page_size:"30"});
  const result = await request<{verses: SearchVerse[]}>(`/search-verses?${params.toString()}`, key);
  return result.verses ?? [];
}
