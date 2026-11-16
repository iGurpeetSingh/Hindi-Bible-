import { BOOKS, BibleBook } from "./books";

export type ReadingPlanTemplate = {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  durationDays: number;
  scope: "all" | "new_testament" | "psalms" | "proverbs";
};

export type ReadingPlanChapter = {
  id: string;
  bookId: string;
  chapter: number;
  bookHindi: string;
  bookEnglish: string;
};

export type ReadingPlanDay = {
  day: number;
  chapters: ReadingPlanChapter[];
};

export const READING_PLAN_TEMPLATES: ReadingPlanTemplate[] = [
  {
    id: "bible-year",
    title: "पूरी बाइबल – 1 वर्ष",
    subtitle: "365 दिन • पुराने और नए नियम",
    description: "उत्पत्ति से प्रकाशितवाक्य तक पूरी बाइबल को क्रम से पढ़ें। हर दिन लगभग 3–4 अध्याय होंगे।",
    durationDays: 365,
    scope: "all"
  },
  {
    id: "new-testament-90",
    title: "नया नियम – 90 दिन",
    subtitle: "90 दिन • 27 पुस्तकें",
    description: "मत्ती से प्रकाशितवाक्य तक नए नियम को लगभग 3 अध्याय प्रतिदिन पढ़ें।",
    durationDays: 90,
    scope: "new_testament"
  },
  {
    id: "psalms-30",
    title: "भजन संहिता – 30 दिन",
    subtitle: "30 दिन • 150 भजन",
    description: "हर दिन लगभग 5 भजन पढ़ें और अपनी गति से आगे बढ़ें।",
    durationDays: 30,
    scope: "psalms"
  },
  {
    id: "proverbs-31",
    title: "नीतिवचन – 31 दिन",
    subtitle: "31 दिन • प्रतिदिन 1 अध्याय",
    description: "प्रतिदिन नीतिवचन का एक अध्याय पढ़कर बुद्धि और व्यवहार पर मनन करें।",
    durationDays: 31,
    scope: "proverbs"
  }
];

export function getReadingPlanTemplate(id: string): ReadingPlanTemplate | undefined {
  return READING_PLAN_TEMPLATES.find(plan => plan.id === id);
}

export function buildReadingPlanSchedule(planId: string): ReadingPlanDay[] {
  const plan = getReadingPlanTemplate(planId);
  if (!plan) return [];

  const selectedBooks: BibleBook[] = BOOKS.filter(book => {
    if (plan.scope === "all") return true;
    if (plan.scope === "new_testament") return book.testament === "new_testament";
    if (plan.scope === "psalms") return book.id === "PSA";
    if (plan.scope === "proverbs") return book.id === "PRO";
    return false;
  });

  const chapters: ReadingPlanChapter[] = selectedBooks.flatMap(book =>
    Array.from({ length: book.chapters }, (_, index) => ({
      id: `${book.id}.${index + 1}`,
      bookId: book.id,
      chapter: index + 1,
      bookHindi: book.hindi,
      bookEnglish: book.english
    }))
  );

  return Array.from({ length: plan.durationDays }, (_, index) => {
    const start = Math.floor(index * chapters.length / plan.durationDays);
    const end = Math.floor((index + 1) * chapters.length / plan.durationDays);
    return { day: index + 1, chapters: chapters.slice(start, end) };
  });
}

export function getLocalDateKey(date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeyToUtc(dateKey: string): number {
  const [year, month, day] = dateKey.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function daysBetweenDateKeys(startDate: string, endDate: string): number {
  return Math.floor((dateKeyToUtc(endDate) - dateKeyToUtc(startDate)) / 86400000);
}

export function shiftDateKey(dateKey: string, days: number): string {
  const date = new Date(dateKeyToUtc(dateKey) + days * 86400000);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

export function getPlanDayNumber(startDate: string, today: string, durationDays: number): number {
  return Math.min(durationDays, Math.max(1, daysBetweenDateKeys(startDate, today) + 1));
}
