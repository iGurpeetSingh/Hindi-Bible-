import { ApiBible } from "./bibleApi";

const BASE = "https://bible.helloao.org/api";

export type ChapterAudio = {
  readerId: string;
  audioUrl: string;
  timings: number[] | null;
};

type AudioChapterResponse = {
  translation?: ApiBible;
  thisChapterAudioLinks?: Record<string, string>;
  thisChapterAudioTimings?: Record<string, string | number[]>;
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Audio API error ${response.status}`);
  return response.json() as Promise<T>;
}

function absoluteApiUrl(path: string): string {
  if (path.startsWith("http")) return path;\n  if (path.startsWith("/api/")) return `https://bible.helloao.org${path}`;\n  return `${BASE}/${path.replace(/^\\//, "")}`;
}

/**
 * Audio is optional per translation, reader and chapter. Never invent an audio
 * URL: return only recordings explicitly published by the selected translation.
 */
export async function getChapterAudio(translationId: string, bookId: string, chapter: number): Promise<ChapterAudio[]> {
  const url = `${BASE}/${encodeURIComponent(translationId)}/${encodeURIComponent(bookId)}/${chapter}.simple.json`;
  const data = await fetchJson<AudioChapterResponse>(url);
  const links = data.thisChapterAudioLinks || {};
  const timingsMap = data.thisChapterAudioTimings || {};

  return Promise.all(Object.entries(links)
    .filter(([, audioUrl]) => typeof audioUrl === "string" && /^https?:\\/\\//i.test(audioUrl))
    .map(async ([readerId, audioUrl]) => {
      const timingValue = timingsMap[readerId];
      let timings: number[] | null = null;
      if (Array.isArray(timingValue)) {
        timings = timingValue.filter(value => typeof value === "number" && Number.isFinite(value));
      } else if (typeof timingValue === "string") {
        try {
          const timingData = await fetchJson<{ verses?: number[] }>(absoluteApiUrl(timingValue));
          if (Array.isArray(timingData.verses)) timings = timingData.verses;
        } catch {
          timings = null;
        }
      }
      return { readerId, audioUrl, timings };
    }));
}
