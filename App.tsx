import React, { useEffect, useMemo, useRef, useState } from "react";
import Svg, { Circle, Line, Path, Rect, Defs, LinearGradient, Stop } from "react-native-svg";
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable, SafeAreaView, Share,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View, Linking, Image, ImageBackground
} from "react-native";
import * as Speech from "expo-speech";
import * as Clipboard from "expo-clipboard";
import * as Sharing from "expo-sharing";
import { captureRef } from "react-native-view-shot";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import { getChapterAudio, ChapterAudio } from "./src/lib/audioApi";
import { BOOKS, BibleBook } from "./src/data/books";
import { ApiBible, ApiIndexBook, getBibleIndex, getHindiBibles, getPassage, searchVerses, searchBibleText } from "./src/lib/bibleApi";
import { BibleNote, BibleNoteKind, NoteReference, ReadingPlanProgress, SavedReference, storage } from "./src/lib/storage";
import { buildReadingPlanSchedule, getLocalDateKey, getPlanDayNumber, getReadingPlanTemplate, READING_PLAN_TEMPLATES, ReadingPlanChapter, shiftDateKey } from "./src/data/readingPlans";

type Tab = "home" | "bible" | "audio" | "search" | "saved" | "settings" | "plan" | "notes";
type Passage = { id:string; content:string; reference:string; copyright?:string };
type PickerTab = "BOOK" | "CHAPTER" | "VERSE";
const C = { bg:"#F0F7F2", blue:"#087A5C", blueDark:"#065B46", pale:"#E1F1E7", ink:"#18372E", muted:"#61776C", line:"#CEE0D5", white:"#FAFDFA", gold:"#D6A64D", green:"#0E6256", red:"#A33D42" };

type HomeIconName = "audio" | "search" | "bookmark" | "plan" | "notes" | "study";
function HomeFeatureIcon({name,color="#FFFFFF"}:{name:HomeIconName;color?:string}) {
  const common={stroke:color,strokeWidth:3.2,strokeLinecap:"round" as const,strokeLinejoin:"round" as const,fill:"none"};
  return <Svg width={36} height={36} viewBox="0 0 64 64">
    {name==="audio"&&<><Path d="M13 34v-4a19 19 0 0 1 38 0v4" {...common}/><Rect x="10" y="33" width="12" height="19" rx="5" {...common}/><Rect x="42" y="33" width="12" height="19" rx="5" {...common}/><Path d="M22 48h7m6 0h7" {...common}/></>}
    {name==="search"&&<><Circle cx="27" cy="27" r="15" {...common}/><Path d="m38 38 15 15" {...common}/></>}
    {name==="bookmark"&&<Path d="M19 10h26v44L32 45 19 54z" {...common}/>}
    {name==="plan"&&<><Rect x="11" y="14" width="42" height="39" rx="5" {...common}/><Line x1="11" y1="26" x2="53" y2="26" {...common}/><Line x1="22" y1="9" x2="22" y2="19" {...common}/><Line x1="42" y1="9" x2="42" y2="19" {...common}/><Path d="M29 35h5v11m-5 0h11" {...common}/></>}
    {name==="notes"&&<><Rect x="10" y="9" width="37" height="46" rx="4" {...common}/><Path d="M18 21h21M18 30h18M18 39h13" {...common}/><Path d="m37 43 14-14 5 5-14 14-7 2z" {...common}/></>}
    {name==="study"&&<><Path d="M10 12h44v32H30L17 55V44h-7z" {...common}/><Circle cx="23" cy="28" r="2.5" fill={color} stroke="none"/><Circle cx="32" cy="28" r="2.5" fill={color} stroke="none"/><Circle cx="41" cy="28" r="2.5" fill={color} stroke="none"/></>}
  </Svg>;
}

function Button({label,onPress,outline=false,disabled=false}:{label:string;onPress:()=>void;outline?:boolean;disabled?:boolean}) {
  return <Pressable disabled={disabled} onPress={onPress} style={[s.button,outline&&s.buttonOutline,disabled&&{opacity:.45}]}><Text style={[s.buttonText,outline&&{color:C.blue}]}>{label}</Text></Pressable>;
}
function cleanVerseText(value:string) {
  return value
    .replace(/\s*\((?=[^)]*(?:इब्रा|कुरि|कुरी|यूहन्ना|रोमि|मत्ती|मरकुस|लूका|प्रेरितों|भजन|नीति|यशा|उत्पत्ति|निर्गमन|गलाति|इफिसि|प्रकाशित|1\s*कुरि|2\s*कुरि))[^)]*\)/gi,"")
    .replace(/\s*\b\d+\s*:\s*\d+(?:\s*[-–,]\s*\d+)?\b/g,"")
    .replace(/\s{2,}/g," ")
    .trim();
}
function verseItems(content:string) {
  return content.split(/\n\s*\n/).map((line)=>line.trim()).filter(Boolean).map((line)=> {
    const m=line.match(/^(\d+)\.\s*([\s\S]*)$/);
    const number=m?Number(m[1]):0;
    const raw=m?m[2]:line;
    return {number,text:cleanVerseText(raw)};
  }).filter(item=>item.text.length>0);
}

export default function App() {
  const [tab,setTab]=useState<Tab>("home");
  const [bibleId,setBibleId]=useState("");
  const [versions,setVersions]=useState<ApiBible[]>([]);
  const [translationLoading,setTranslationLoading]=useState(true);
  const [audioAvailability,setAudioAvailability]=useState<"idle"|"checking"|"available"|"unavailable"|"error">("idle");
  const [audioAvailabilityMessage,setAudioAvailabilityMessage]=useState("");
  const [catalog,setCatalog]=useState<ApiIndexBook[]>([]);
  const [book,setBook]=useState<BibleBook>(BOOKS[0]);
  const [chapter,setChapter]=useState(1);
  const [passage,setPassage]=useState<Passage|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [filter,setFilter]=useState("");
  const [testament,setTestament]=useState<"all"|"old_testament"|"new_testament">("all");
  const [query,setQuery]=useState("");
  const [searchAttempted,setSearchAttempted]=useState(false);
  const [results,setResults]=useState<{reference:string;passage?:Passage}[]>([]);
  const [bookmarks,setBookmarks]=useState<SavedReference[]>([]);
  const [history,setHistory]=useState<SavedReference[]>([]);
  const [selectedVerse,setSelectedVerse]=useState<number|null>(null);
  const [verseMenuVisible,setVerseMenuVisible]=useState(false);
  const [imageShareVisible,setImageShareVisible]=useState(false);
  const verseCardRef=useRef<View>(null);
  const [noteModalVisible,setNoteModalVisible]=useState(false);
  const [noteDraft,setNoteDraft]=useState("");
  const [noteTitleDraft,setNoteTitleDraft]=useState("");
  const [noteTagsDraft,setNoteTagsDraft]=useState("");
  const [noteKindDraft,setNoteKindDraft]=useState<BibleNoteKind>("personal");
  const [noteReferenceDraft,setNoteReferenceDraft]=useState<NoteReference|null>(null);
  const [editingNoteId,setEditingNoteId]=useState<string|null>(null);
  const [notes,setNotes]=useState<BibleNote[]>([]);
  const [noteQuery,setNoteQuery]=useState("");
  const [noteFilter,setNoteFilter]=useState("सभी");
  const [noteDeleteConfirmId,setNoteDeleteConfirmId]=useState<string|null>(null);
  const [noteSortMode,setNoteSortMode]=useState<"newest"|"oldest"|"title">("newest");
  const [noteSortMenuVisible,setNoteSortMenuVisible]=useState(false);
  const [noteActionsOpenId,setNoteActionsOpenId]=useState<string|null>(null);
  const [noteBackupModalVisible,setNoteBackupModalVisible]=useState(false);
  const [noteImportDraft,setNoteImportDraft]=useState("");
  const [verseNotes,setVerseNotes]=useState<Record<string,string>>({});
  const [verseHighlights,setVerseHighlights]=useState<Record<string,string>>({});
  const [fontSize,setFontSize]=useState(16);
  const [daily,setDaily]=useState<Passage|null>(null);
  const [drawer,setDrawer]=useState(false);
  const [picker,setPicker]=useState(false);
  const [pickerTab,setPickerTab]=useState<PickerTab>("BOOK");
  const [speaking,setSpeaking]=useState(false);
  const [speechVerse,setSpeechVerse]=useState(0);
  const audioPlayer=useAudioPlayer(null,{updateInterval:500});
  const audioStatus=useAudioPlayerStatus(audioPlayer);
  const [audioItems,setAudioItems]=useState<ChapterAudio[]>([]);
  const [audioReader,setAudioReader]=useState("");
  const [audioLoading,setAudioLoading]=useState(false);
  const [audioError,setAudioError]=useState("");
  const [audioRate,setAudioRate]=useState(1);
  const [audioAutoNext,setAudioAutoNext]=useState(true);
  const [audioDownloaded,setAudioDownloaded]=useState(false);
  const [audioLocalUri,setAudioLocalUri]=useState("");
  const [audioVerse,setAudioVerse]=useState(-1);
  const [audioTrackWidth,setAudioTrackWidth]=useState(1);
  const [planProgress,setPlanProgress]=useState<ReadingPlanProgress|null>(null);
  const [planSelectedId,setPlanSelectedId]=useState("bible-year");
  const [planViewedDay,setPlanViewedDay]=useState(0);
  const [planConfirmStop,setPlanConfirmStop]=useState(false);
  const [planMessage,setPlanMessage]=useState("");

  useEffect(()=>{
    (async()=>{
      const [id,bm,hist,fz,savedPlan,savedNotes,savedHighlights,savedNoteLibrary]=await Promise.all([storage.getBibleId(),storage.getBookmarks(),storage.getHistory(),storage.getFontSize(),storage.getReadingPlan(),storage.getNotes(),storage.getHighlights(),storage.getNoteLibrary()]);
      const migratedLegacyNotes:BibleNote[]=Object.entries(savedNotes).flatMap(([key,content])=>{
        const [bookId,chapterValue,verseValue]=key.split(".");
        const target=BOOKS.find(item=>item.id===bookId);
        const chapterNumber=Number(chapterValue),verseNumber=Number(verseValue);
        if(!target||!chapterNumber||!verseNumber||!content?.trim())return [];
        const reference:NoteReference={bookId:target.id,bookHindi:target.hindi,bookEnglish:target.english,chapter:chapterNumber,verse:verseNumber};
        return [{id:`legacy:${key}`,title:`${target.hindi} ${chapterNumber}:${verseNumber}`,content,kind:"verse" as const,tags:["वचन"],reference,createdAt:Date.now(),updatedAt:Date.now()}];
      });
      const currentNoteKeys=new Set(savedNoteLibrary.filter(item=>item.reference?.verse).map(item=>`${item.reference!.bookId}.${item.reference!.chapter}.${item.reference!.verse}`));
      const newLegacyNotes=migratedLegacyNotes.filter(item=>!currentNoteKeys.has(`${item.reference!.bookId}.${item.reference!.chapter}.${item.reference!.verse}`));
      const mergedNotes=[...savedNoteLibrary,...newLegacyNotes];
      setBookmarks(bm);setHistory(hist);setPlanProgress(savedPlan);setVerseNotes(savedNotes);setVerseHighlights(savedHighlights);setNotes(mergedNotes);setFontSize(18); if(fz!==18) await storage.setFontSize(18);
      if(newLegacyNotes.length) await storage.setNoteLibrary(mergedNotes);
      try {
        const available=await getHindiBibles();
        setVersions(available);
        const selected=available.find(item=>item.id===id)||available[0];
        if(selected?.id){
          setBibleId(selected.id);
          if(selected.id!==id) await storage.setBibleId(selected.id);
        } else {
          setError("हिंदी बाइबल अनुवाद अभी उपलब्ध नहीं है। इंटरनेट कनेक्शन जाँचें।");
        }
      } catch(e) {
        setBibleId("");
        setVersions([]);
        setError(e instanceof Error?e.message:"हिंदी बाइबल अनुवाद सत्यापित नहीं हो सके। इंटरनेट कनेक्शन जाँचें।");
      } finally {setTranslationLoading(false);}
    })();
    return ()=>{Speech.stop();};
  },[]);

  useEffect(()=>{
    if(!bibleId)return;
    (async()=>{
      try {
        const [idx,verse]=await Promise.all([getBibleIndex("",bibleId),getPassage("",bibleId,"JHN.3.16")]);
        setCatalog(idx);setDaily(verse);
      } catch(e) {setError(e instanceof Error?e.message:"Bible data लोड नहीं हुआ।");}
    })();
  },[bibleId]);

  const chapterCount=useMemo(()=>catalog.find(x=>x.id===book.id)?.chapters.length||book.chapters,[catalog,book]);
  const verseList=useMemo(()=>passage?verseItems(passage.content):[],[passage]);
  const filteredBooks=useMemo(()=>BOOKS.filter(b=>(testament==="all"||b.testament===testament)&&(b.hindi.toLowerCase().includes(filter.toLowerCase())||b.english.toLowerCase().includes(filter.toLowerCase()))),[filter,testament]);
  const activePlanTemplate=useMemo(()=>planProgress?getReadingPlanTemplate(planProgress.planId):undefined,[planProgress?.planId]);
  const activePlanSchedule=useMemo(()=>activePlanTemplate?buildReadingPlanSchedule(activePlanTemplate.id):[],[activePlanTemplate?.id]);
  const planTodayIndex=activePlanTemplate&&planProgress?getPlanDayNumber(planProgress.startDate,getLocalDateKey(),activePlanTemplate.durationDays):1;
  const planDisplayDay=Math.min(Math.max(planViewedDay||planTodayIndex,1),activePlanTemplate?.durationDays||1);
  const displayedPlanDay=activePlanSchedule[planDisplayDay-1]||null;
  const planCompletedSet=useMemo(()=>new Set<string>(planProgress?.completedChapters||[]),[planProgress]);
  const planTotalChapters=activePlanSchedule.reduce((sum,day)=>sum+day.chapters.length,0);
  const planCompletedCount=activePlanSchedule.reduce((sum,day)=>sum+day.chapters.filter(item=>planCompletedSet.has(item.id)).length,0);
  const planProgressPercent=planTotalChapters?Math.round(planCompletedCount/planTotalChapters*100):0;
  const displayedDayComplete=!!displayedPlanDay&&displayedPlanDay.chapters.length>0&&displayedPlanDay.chapters.every(item=>planCompletedSet.has(item.id));
  const selectedPlanTemplate=READING_PLAN_TEMPLATES.find(item=>item.id===planSelectedId)||READING_PLAN_TEMPLATES[0];
  const noteFilterOptions=["सभी","व्यक्तिगत","वचन नोट्स","बाइबल अध्ययन"];
  const filteredNotes=useMemo(()=>{
    const term=noteQuery.trim().toLocaleLowerCase("hi");
    return notes.filter(item=>{
      const category=item.kind==="personal"?"व्यक्तिगत":item.kind==="verse"?"वचन नोट्स":"बाइबल अध्ययन";
      if(noteFilter!=="सभी"&&category!==noteFilter)return false;
      if(!term)return true;
      const reference=item.reference?`${item.reference.bookHindi} ${item.reference.bookEnglish} ${item.reference.chapter} ${item.reference.verse||""}`:"";
      return [item.title,item.content,item.tags.join(" "),reference].join(" ").toLocaleLowerCase("hi").includes(term);
    }).sort((a,b)=>noteSortMode==="oldest"?a.updatedAt-b.updatedAt:noteSortMode==="title"?a.title.localeCompare(b.title,"hi"):b.updatedAt-a.updatedAt);
  },[notes,noteQuery,noteFilter,noteSortMode]);
  const noteCategoryCounts=useMemo(()=>({
    "सभी":notes.length,
    "व्यक्तिगत":notes.filter(item=>item.kind==="personal").length,
    "वचन नोट्स":notes.filter(item=>item.kind==="verse").length,
    "बाइबल अध्ययन":notes.filter(item=>item.kind==="study").length
  }),[notes]);

  async function openChapter(nextBook:BibleBook,nextChapter:number) {
    setBook(nextBook);setChapter(nextChapter);setTab("bible");setDrawer(false);setPicker(false);setPassage(null);setSelectedVerse(null);setVerseMenuVisible(false);setError("");
    await Speech.stop();setSpeaking(false);
    if(!bibleId){setError("पहले Settings में जाकर Hindi Bible Translation चुनें।");return;}
    setLoading(true);
    try {
      const data=await getPassage("",bibleId,`${nextBook.id}.${nextChapter}`);
      setPassage(data);
      const item:SavedReference={id:`${nextBook.id}.${nextChapter}`,reference:`${nextBook.hindi} ${nextChapter}`,bookId:nextBook.id,chapter:nextChapter,createdAt:Date.now()};
      const updated=[item,...history.filter(x=>x.id!==item.id)].slice(0,50);
      setHistory(updated);await storage.setHistory(updated);
    } catch(e){setError(e instanceof Error?e.message:"अध्याय लोड नहीं हुआ।");}
    finally{setLoading(false);}
  }

  async function startReadingPlan(planId:string) {
    const template=getReadingPlanTemplate(planId);
    if(!template){setPlanMessage("यह Reading Plan उपलब्ध नहीं है।");return;}
    const next:ReadingPlanProgress={planId:template.id,startDate:getLocalDateKey(),completedChapters:[],updatedAt:Date.now()};
    await storage.setReadingPlan(next);
    setPlanProgress(next);setPlanViewedDay(1);setPlanConfirmStop(false);setPlanMessage("");
  }

  async function updatePlanChapters(chapterIds:string[],complete:boolean) {
    if(!planProgress)return;
    const completed=new Set(planProgress.completedChapters);
    chapterIds.forEach(id=>complete?completed.add(id):completed.delete(id));
    const next:ReadingPlanProgress={...planProgress,completedChapters:[...completed],updatedAt:Date.now()};
    setPlanProgress(next);
    await storage.setReadingPlan(next);
  }

  async function togglePlanChapter(chapterId:string) {
    await updatePlanChapters([chapterId],!planCompletedSet.has(chapterId));
  }

  async function completeDisplayedPlanDay() {
    if(!displayedPlanDay)return;
    await updatePlanChapters(displayedPlanDay.chapters.map(item=>item.id),true);
    setPlanMessage(`दिन ${displayedPlanDay.day} की सभी पढ़ाइयाँ पूरी चिह्नित कर दी गई हैं।`);
  }

  async function catchUpReadingPlan() {
    if(!planProgress||!activePlanSchedule.length)return;
    const firstIncomplete=activePlanSchedule.findIndex(day=>day.chapters.some(item=>!planCompletedSet.has(item.id)));
    if(firstIncomplete<0){setPlanMessage("यह योजना पहले ही पूरी हो चुकी है।");return;}
    const next:ReadingPlanProgress={...planProgress,startDate:shiftDateKey(getLocalDateKey(),-firstIncomplete),updatedAt:Date.now()};
    setPlanProgress(next);await storage.setReadingPlan(next);setPlanViewedDay(firstIncomplete+1);
    setPlanMessage(`आपकी अगली अधूरी पढ़ाई दिन ${firstIncomplete+1} पर सेट की गई है।`);
  }

  async function stopReadingPlan() {
    await storage.clearReadingPlan();
    setPlanProgress(null);setPlanViewedDay(0);setPlanConfirmStop(false);
    setPlanMessage("योजना बंद कर दी गई है। आपकी Bookmarks और Reading History सुरक्षित हैं।");
  }

  function openPlanChapter(item:ReadingPlanChapter) {
    const target=BOOKS.find(entry=>entry.id===item.bookId);
    if(target)openChapter(target,item.chapter);
  }

  async function selectBook(b:BibleBook) {
    setBook(b);setChapter(1);setPassage(null);setError("");setDrawer(false);setPickerTab("CHAPTER");setPicker(true);
  }

  async function toggleBookmark() {
    const id=`${book.id}.${chapter}`;const exists=bookmarks.some(x=>x.id===id);
    const item:SavedReference={id,reference:`${book.hindi} ${chapter}`,bookId:book.id,chapter,createdAt:Date.now()};
    const updated=exists?bookmarks.filter(x=>x.id!==id):[item,...bookmarks];
    setBookmarks(updated);await storage.setBookmarks(updated);
    Alert.alert(exists?"बुकमार्क हटाया":"बुकमार्क सेव हुआ",exists?"यह अध्याय सेव सूची से हटा दिया गया।":"यह अध्याय आपकी सेव सूची में है।");
  }

  function verseStorageKey(verse:number) { return `${book.id}.${chapter}.${verse}`; }
  const activeVerse=selectedVerse===null?null:verseList.find(item=>item.number===selectedVerse)||null;
  const activeVerseKey=selectedVerse===null?"":verseStorageKey(selectedVerse);
  const activeVerseReference=selectedVerse===null?"":`${book.hindi} ${chapter}:${selectedVerse}`;

  function selectVerseAndShowActions(verse:number) {
    if(selectedVerse===verse && verseMenuVisible) { setVerseMenuVisible(false); return; }
    setSelectedVerse(verse);setVerseMenuVisible(true);
  }

  async function toggleSelectedVerseHighlight() {
    if(selectedVerse===null)return;
    if(verseHighlights[activeVerseKey]) await clearVerseHighlight();
    else await setVerseHighlight("#FFF1A8");
  }

  async function copySelectedVerse() {
    if(!activeVerse||!activeVerseReference)return;
    try {
      await Clipboard.setStringAsync(`${activeVerse.text} — ${activeVerseReference}`);
      setVerseMenuVisible(false);
      Alert.alert("कॉपी हो गया","वचन और उसका Reference Clipboard में कॉपी कर दिया गया।");
    } catch { Alert.alert("कॉपी नहीं हुआ","Clipboard की अनुमति उपलब्ध नहीं है।"); }
  }

  async function shareSelectedVerse() {
    if(!activeVerse||!activeVerseReference)return;
    try {
      await Share.share({message:`${activeVerse.text}\n\n— ${activeVerseReference}`});
      setVerseMenuVisible(false);
    } catch { Alert.alert("Share नहीं हुआ","वचन शेयर करते समय समस्या आई।"); }
  }

  async function toggleVerseBookmark() {
    if(!activeVerse||selectedVerse===null)return;
    const id=`verse:${activeVerseKey}`;
    const exists=bookmarks.some(item=>item.id===id);
    const item:SavedReference={id,reference:activeVerseReference,bookId:book.id,chapter,verse:selectedVerse,createdAt:Date.now()};
    const updated=exists?bookmarks.filter(entry=>entry.id!==id):[item,...bookmarks];
    setBookmarks(updated);await storage.setBookmarks(updated);
    setVerseMenuVisible(false);
    Alert.alert(exists?"वचन Bookmark हटाया":"वचन Bookmark सेव हुआ",exists?"यह वचन सेव सूची से हटा दिया गया।":"यह वचन आपकी सेव सूची में सुरक्षित है।");
  }

  function referenceLabel(reference?:NoteReference|null) {
    if(!reference)return "";
    return `${reference.bookHindi} ${reference.chapter}${reference.verse?":"+reference.verse:""}`;
  }

  function openNewNote(kind:BibleNoteKind="personal") {
    setEditingNoteId(null);setNoteTitleDraft("");setNoteDraft("");setNoteTagsDraft("");
    setNoteKindDraft(kind);setNoteReferenceDraft(null);setNoteModalVisible(true);
  }

  function openEditNote(item:BibleNote) {
    setEditingNoteId(item.id);setNoteTitleDraft(item.title);setNoteDraft(item.content);
    setNoteTagsDraft(item.tags.join(", "));setNoteKindDraft(item.kind);
    setNoteReferenceDraft(item.reference||null);setNoteModalVisible(true);
  }

  function addCurrentChapterReference() {
    setNoteReferenceDraft({bookId:book.id,bookHindi:book.hindi,bookEnglish:book.english,chapter,verse:tab==="bible"?selectedVerse||undefined:undefined});
  }

  function openVerseNote() {
    if(selectedVerse===null)return;
    const existing=notes.find(item=>item.reference?.bookId===book.id&&item.reference.chapter===chapter&&item.reference.verse===selectedVerse);
    setEditingNoteId(existing?.id||null);
    setNoteTitleDraft(existing?.title||activeVerseReference);
    setNoteDraft(existing?.content||verseNotes[activeVerseKey]||"");
    setNoteTagsDraft(existing?.tags.join(", ")||"वचन");
    setNoteKindDraft("verse");
    setNoteReferenceDraft({bookId:book.id,bookHindi:book.hindi,bookEnglish:book.english,chapter,verse:selectedVerse});
    setVerseMenuVisible(false);setNoteModalVisible(true);
  }

  async function saveNote() {
    const content=noteDraft.trim();
    if(!content){Alert.alert("नोट खाली है","सेव करने से पहले अपना विचार लिखें।");return;}
    const now=Date.now();
    const previous=editingNoteId?notes.find(item=>item.id===editingNoteId):noteKindDraft==="verse"&&noteReferenceDraft?.verse?notes.find(item=>item.reference?.bookId===noteReferenceDraft.bookId&&item.reference.chapter===noteReferenceDraft.chapter&&item.reference.verse===noteReferenceDraft.verse):undefined;
    const id=editingNoteId||previous?.id||`note-${now}`;
    const tags=noteTagsDraft.split(",").map(item=>item.trim()).filter(Boolean).filter((item,index,array)=>array.indexOf(item)===index);
    const entry:BibleNote={
      id,
      title:noteTitleDraft.trim()||referenceLabel(noteReferenceDraft)||"बिना शीर्षक नोट",
      content,
      kind:noteKindDraft,
      tags,
      reference:noteReferenceDraft||undefined,
      createdAt:previous?.createdAt||now,
      updatedAt:now
    };
    const updated=previous?notes.map(item=>item.id===previous.id?entry:item):[entry,...notes];
    setNotes(updated);
    await storage.setNoteLibrary(updated);

    const legacyNext={...verseNotes};
    const oldReference=previous?.kind==="verse"?previous.reference:undefined;
    if(oldReference?.verse&&(noteKindDraft!=="verse"||oldReference.bookId!==noteReferenceDraft?.bookId||oldReference.chapter!==noteReferenceDraft?.chapter||oldReference.verse!==noteReferenceDraft?.verse)){
      delete legacyNext[`${oldReference.bookId}.${oldReference.chapter}.${oldReference.verse}`];
    }
    if(noteKindDraft==="verse"&&noteReferenceDraft?.verse){
      legacyNext[`${noteReferenceDraft.bookId}.${noteReferenceDraft.chapter}.${noteReferenceDraft.verse}`]=content;
    }
    if(JSON.stringify(legacyNext)!==JSON.stringify(verseNotes)){
      setVerseNotes(legacyNext);await storage.setNotes(legacyNext);
    }
    setNoteModalVisible(false);setEditingNoteId(null);
    Alert.alert("नोट सेव हुआ",`“${entry.title}” आपके Notes Library में सुरक्षित है।`);
  }

  async function deleteNote(item:BibleNote) {
    const updated=notes.filter(note=>note.id!==item.id);
    setNotes(updated);await storage.setNoteLibrary(updated);
    if(item.kind==="verse"&&item.reference?.verse){
      const legacyNext={...verseNotes};
      delete legacyNext[`${item.reference.bookId}.${item.reference.chapter}.${item.reference.verse}`];
      setVerseNotes(legacyNext);await storage.setNotes(legacyNext);
    }
    setNoteDeleteConfirmId(null);
  }

  async function shareNote(item:BibleNote) {
    const tags=item.tags.length?`\n\nTags: ${item.tags.join(", ")}`:"";
    const reference=item.reference?(`\n\nBible Reference: ${referenceLabel(item.reference)}`):"";
    try { await Share.share({message:`${item.title}\n\n${item.content}${reference}${tags}\n\n— Hindi Bible`}); }
    catch { Alert.alert("Share नहीं हुआ","नोट शेयर करते समय समस्या आई।"); }
  }

  async function copyNotesBackup() {
    const payload={format:"hindi-bible-notes",version:1,exportedAt:new Date().toISOString(),notes};
    try {
      await Clipboard.setStringAsync(JSON.stringify(payload,null,2));
      Alert.alert("Backup तैयार है",`${notes.length} नोट्स का JSON Backup Clipboard में कॉपी हो गया है। इसे किसी सुरक्षित जगह सेव करें।`);
    } catch {
      Alert.alert("Backup नहीं बना","Clipboard तक पहुँच उपलब्ध नहीं है।");
    }
  }

  async function exportNotesBackup() {
    const payload={format:"hindi-bible-notes",version:1,exportedAt:new Date().toISOString(),notes};
    try {
      await Share.share({title:"Hindi Bible Notes Backup",message:JSON.stringify(payload,null,2)});
    } catch {
      Alert.alert("Export नहीं हुआ","Notes Backup शेयर करते समय समस्या आई।");
    }
  }

  function openNotesImport() {
    setNoteImportDraft("");setNoteBackupModalVisible(true);
  }

  async function importNotesBackup() {
    try {
      const payload=JSON.parse(noteImportDraft) as {format?:unknown;version?:unknown;notes?:unknown};
      if(payload.format!=="hindi-bible-notes"||payload.version!==1||!Array.isArray(payload.notes)) {
        Alert.alert("Backup Format सही नहीं","Hindi Bible Notes का Version 1 JSON Backup चुनें।");return;
      }
      const incoming:BibleNote[]=payload.notes.flatMap((value:unknown)=>{
        if(!value||typeof value!=="object")return [];
        const item=value as Partial<BibleNote>;
        if(typeof item.id!=="string"||typeof item.content!=="string"||!item.content.trim())return [];
        const kind=item.kind==="verse"||item.kind==="study"?item.kind:"personal";
        const reference=item.reference&&typeof item.reference.bookId==="string"&&typeof item.reference.chapter==="number"?item.reference:undefined;
        return [{
          id:item.id,
          title:typeof item.title==="string"&&item.title.trim()?item.title:"बिना शीर्षक नोट",
          content:item.content,
          kind,
          tags:Array.isArray(item.tags)?item.tags.filter((tag):tag is string=>typeof tag==="string"):[],
          reference,
          createdAt:typeof item.createdAt==="number"?item.createdAt:Date.now(),
          updatedAt:typeof item.updatedAt==="number"?item.updatedAt:Date.now()
        }];
      });
      if(!incoming.length){Alert.alert("कोई मान्य नोट नहीं मिला","Backup में पढ़े जा सकने वाले Notes नहीं मिले।");return;}
      const merged=new Map(notes.map(item=>[item.id,item]));
      incoming.forEach(item=>merged.set(item.id,item));
      const updated=[...merged.values()].sort((a,b)=>b.updatedAt-a.updatedAt);
      setNotes(updated);await storage.setNoteLibrary(updated);
      const legacyNext={...verseNotes};
      incoming.forEach(item=>{
        if(item.kind==="verse"&&item.reference?.verse)legacyNext[`${item.reference.bookId}.${item.reference.chapter}.${item.reference.verse}`]=item.content;
      });
      setVerseNotes(legacyNext);await storage.setNotes(legacyNext);
      setNoteBackupModalVisible(false);setNoteImportDraft("");
      Alert.alert("Import पूरा हुआ",`${incoming.length} Notes Import/Update हुए।`);
    } catch {
      Alert.alert("JSON पढ़ा नहीं जा सका","पूरे Backup JSON को कॉपी करके फिर से Paste करें।");
    }
  }

  function openNoteReference(item:BibleNote) {
    if(!item.reference)return;
    const target=BOOKS.find(entry=>entry.id===item.reference?.bookId);
    if(target)openChapter(target,item.reference.chapter);
  }

  async function setVerseHighlight(color:string) {
    if(selectedVerse===null)return;
    const next={...verseHighlights,[activeVerseKey]:color};
    setVerseHighlights(next);
    await storage.setHighlights(next);
    setVerseMenuVisible(false);
  }

  async function clearVerseHighlight() {
    if(selectedVerse===null)return;
    const next={...verseHighlights};
    delete next[activeVerseKey];
    setVerseHighlights(next);
    await storage.setHighlights(next);
    setVerseMenuVisible(false);
  }

  async function playSelectedVerse() {
    if(selectedVerse===null)return;
    const index=verseList.findIndex(item=>item.number===selectedVerse);
    setVerseMenuVisible(false);
    if(index>=0) await speakFrom(index);
  }

  function openVerseImageShare() {
    setVerseMenuVisible(false);
    setImageShareVisible(true);
  }

  async function shareVerseImage() {
    if(!activeVerse||!activeVerseReference)return;
    if(Platform.OS==="web") {
      await shareSelectedVerse();
      setImageShareVisible(false);
      return;
    }
    try {
      if(!verseCardRef.current) throw new Error("Verse card अभी तैयार नहीं है।");
      const uri=await captureRef(verseCardRef,{format:"png",quality:1,result:"tmpfile"});
      await Sharing.shareAsync(uri,{mimeType:"image/png",dialogTitle:activeVerseReference});
      setImageShareVisible(false);
    } catch(e) {
      Alert.alert("Image Share उपलब्ध नहीं",e instanceof Error?e.message:"वचन की Image तैयार नहीं हो सकी।");
    }
  }

  async function speakFrom(index:number) {
    if(!passage||!verseList.length)return;
    await Speech.stop();setSpeaking(true);setSpeechVerse(index);
    const speakNext=(i:number)=>{
      if(i>=verseList.length){setSpeaking(false);setSpeechVerse(0);return;}
      setSpeechVerse(i);
      Speech.speak(verseList[i].text,{language:"hi-IN",rate:0.88,pitch:1,onDone:()=>speakNext(i+1),onStopped:()=>setSpeaking(false),onError:()=>{setSpeaking(false);Alert.alert("आवाज़ उपलब्ध नहीं","फोन की Text-to-Speech सेटिंग में Hindi voice डाउनलोड/चुनें।");}});
    };
    speakNext(index);
  }
  async function stopSpeech(){await Speech.stop();setSpeaking(false);}
  async function runSearch(){
    if(!bibleId){Alert.alert("सेटअप जरूरी है","पहले Settings में Hindi Bible Translation चुनें।");return;}
    const term=query.trim();
    if(!term)return;
    setSearchAttempted(true);
    setLoading(true);setError("");setResults([]);
    try{
      let mapped:{reference:string;passage?:Passage}[]=[];
      // First support exact references such as GEN.1.1 and यूहन्ना 3:16.
      try {
        const refs=await searchVerses("",bibleId,term);
        mapped=await Promise.all(refs.map(async item=>{
          let text:Passage|undefined;
          try{text=await getPassage("",bibleId,item.reference||item.passage_id||"");}catch{}
          return {reference:item.reference||item.passage_id||"",passage:text};
        }));
      } catch {
        // Otherwise search every verse in the selected translation.
        const hits=await searchBibleText(bibleId,term,100);
        mapped=hits.map(hit=>({
          reference:hit.reference,
          passage:{
            id:hit.reference,
            reference:`${hit.bookName} ${hit.chapter}:${hit.verse}`,
            content:`${hit.verse}. ${hit.text}`
          }
        }));
      }
      setResults(mapped);
    }catch(e){
      setError(e instanceof Error?e.message:"खोज पूरी नहीं हुई। इंटरनेट कनेक्शन जाँचें और दोबारा प्रयास करें।");
    } finally {setLoading(false);}
  }
  async function selectTranslation(nextId:string) {
    const selected=versions.find(item=>item.id===nextId);
    if(!selected)return;
    setBibleId(nextId);
    await storage.setBibleId(nextId);
    setCatalog([]);
    setDaily(null);
    setAudioAvailability("idle");
    setAudioAvailabilityMessage("");
    setAudioItems([]);
    audioPlayer.pause();
    Alert.alert("अनुवाद बदल गया",`${selected.title} अब आपकी चुनी हुई Hindi Bible है।`);
  }

  async function checkSettingsAudio() {
    if(!bibleId){setAudioAvailability("error");setAudioAvailabilityMessage("पहले उपलब्ध हिंदी अनुवाद चुनें।");return;}
    setAudioAvailability("checking");
    setAudioAvailabilityMessage(`${book.hindi} अध्याय ${chapter} की Recording जाँची जा रही है…`);
    try {
      const items=await getChapterAudio(bibleId,book.id,chapter);
      if(items.length){
        setAudioAvailability("available");
        setAudioAvailabilityMessage(`${book.hindi} अध्याय ${chapter} के लिए ${items.length} Recorded Audio option उपलब्ध हैं।`);
      } else {
        setAudioAvailability("unavailable");
        setAudioAvailabilityMessage(`${book.hindi} अध्याय ${chapter} की Recorded Audio इस Translation में उपलब्ध नहीं है।`);
      }
    } catch(e) {
      setAudioAvailability("error");
      setAudioAvailabilityMessage(e instanceof Error?e.message:"Audio Availability जाँची नहीं जा सकी।");
    }
  }
  function openReference(ref:string){const p=ref.split(".");const target=BOOKS.find(x=>x.id===p[0]);if(target)openChapter(target,Number(p[1])||1);}
  function changeTab(next:Tab){stopSpeech();if(next!=="audio")audioPlayer.pause();setTab(next);setError("");setDrawer(false);setPicker(false);}
  function openPicker(which:PickerTab="BOOK"){setPickerTab(which);setPicker(true);}
  const currentSaved=bookmarks.some(x=>x.id===`${book.id}.${chapter}`);
  const chapterNumbers=Array.from({length:chapterCount},(_,i)=>i+1);
  const verseNumbers=verseList.map(v=>v.number).filter(Boolean);
  const selectedAudio=audioItems.find(item=>item.readerId===audioReader)||audioItems[0];
  const formatTime=(seconds:number)=>{if(!Number.isFinite(seconds)||seconds<0)return "0:00";const value=Math.floor(seconds);return `${Math.floor(value/60)}:${String(value%60).padStart(2,"0")}`;};
  const syncedVerse=selectedAudio?.timings?.length ? selectedAudio.timings.reduce((active,start,index)=>start<=audioStatus.currentTime?index:active,-1) : -1;

  async function openAudioChapter(nextBook:BibleBook,nextChapter:number,autoPlay=false,readerOverride?:string) {
    setBook(nextBook);setChapter(nextChapter);setTab("audio");setDrawer(false);setPicker(false);Speech.stop().catch(()=>{});setSpeaking(false);
    setAudioLoading(true);setAudioError("");setAudioItems([]);setAudioReader("");setAudioLocalUri("");setAudioDownloaded(false);setAudioVerse(-1);
    audioPlayer.pause();
    try {
      if(!bibleId) throw new Error("पहले Settings में Hindi Bible Translation चुनें।");
      const [chapterData,audioData]=await Promise.all([
        getPassage("",bibleId,`${nextBook.id}.${nextChapter}`),
        getChapterAudio(bibleId,nextBook.id,nextChapter)
      ]);
      setPassage(chapterData);
      if(!audioData.length) throw new Error("इस Hindi Translation के इस अध्याय की Recorded Audio उपलब्ध नहीं है। दूसरे अध्याय या उपलब्ध Translation को जाँचें।");
      setAudioItems(audioData);
      const chosen=audioData.find(item=>item.readerId===readerOverride)||audioData[0];
      setAudioReader(chosen.readerId);
      const fileName=`${bibleId}-${nextBook.id}-${nextChapter}-${chosen.readerId}.mp3`.replace(/[^a-zA-Z0-9._-]/g,"_");
      let existingLocalUri="";
      if(Platform.OS!=="web"){
        const directory=new Directory(Paths.document,"HindiBibleAudio");
        if(!directory.exists) directory.create({intermediates:true,idempotent:true});
        const localFile=new File(directory,fileName);
        if(localFile.exists){existingLocalUri=localFile.uri;setAudioLocalUri(localFile.uri);setAudioDownloaded(true);}
      }
      audioPlayer.replace(existingLocalUri || chosen.audioUrl);
      if(autoPlay) {
        audioPlayer.setActiveForLockScreen(true,{title:`${nextBook.hindi} अध्याय ${nextChapter}`,artist:"Hindi Bible",albumTitle:"Audio Bible"},{showSeekForward:true,showSeekBackward:true});
        audioPlayer.play();
      }
    } catch(e) {
      setAudioError(e instanceof Error?e.message:"ऑडियो उपलब्ध नहीं हो पाया।");
    } finally {setAudioLoading(false);}
  }

  async function playAudio() {
    if(!selectedAudio){await openAudioChapter(book,chapter,false);return;}
    try {
      await setAudioModeAsync({playsInSilentMode:true,shouldPlayInBackground:true,interruptionMode:"doNotMix"});
      audioPlayer.setActiveForLockScreen(true,{title:`${book.hindi} अध्याय ${chapter}`,artist:"Hindi Bible",albumTitle:"Audio Bible"},{showSeekForward:true,showSeekBackward:true});
      if(audioStatus.didJustFinish) await audioPlayer.seekTo(0);
      audioPlayer.play();
    } catch(e) {setAudioError(e instanceof Error?e.message:"Audio playback शुरू नहीं हो पाया।");}
  }

  async function changeAudioReader(readerId:string) {
    const item=audioItems.find(x=>x.readerId===readerId);
    if(!item)return;
    setAudioReader(readerId);setAudioLocalUri("");setAudioDownloaded(false);setAudioVerse(-1);
    audioPlayer.replace(item.audioUrl);
    audioPlayer.setPlaybackRate(audioRate);
    audioPlayer.play();
  }

  async function downloadAudio() {
    if(!selectedAudio)return;
    if(Platform.OS==="web") {
      try {
        const response=await fetch(selectedAudio.audioUrl);
        if(!response.ok) throw new Error("Audio file download failed");
        const blob=await response.blob();
        const objectUrl=URL.createObjectURL(blob);
        const anchor=document.createElement("a");
        anchor.href=objectUrl;
        anchor.download=`${book.id}-${chapter}-${selectedAudio.readerId}.mp3`;
        document.body.appendChild(anchor);anchor.click();anchor.remove();
        URL.revokeObjectURL(objectUrl);
      } catch {
        setAudioError("इस Audio Server ने Browser Download की अनुमति नहीं दी। Audio को नए टैब में खोलने के लिए नीचे दिए लिंक का उपयोग करें।");
      }
      return;
    }
    try {
      setAudioLoading(true);
      const directory=new Directory(Paths.document,"HindiBibleAudio");
      if(!directory.exists) directory.create({intermediates:true,idempotent:true});
      const fileName=`${bibleId}-${book.id}-${chapter}-${selectedAudio.readerId}.mp3`.replace(/[^a-zA-Z0-9._-]/g,"_");
      const destination=new File(directory,fileName);
      const file=await File.downloadFileAsync(selectedAudio.audioUrl,destination,{idempotent:true});
      setAudioLocalUri(file.uri);setAudioDownloaded(true);
      audioPlayer.replace(file.uri);
      Alert.alert("डाउनलोड पूरा","यह अध्याय अब इस डिवाइस पर Offline चलाया जा सकता है।");
    } catch(e) {setAudioError(e instanceof Error?e.message:"Audio Download असफल रहा।");}
    finally {setAudioLoading(false);}
  }

  function seekAudio(seconds:number) { if(audioStatus.duration>0) audioPlayer.seekTo(Math.max(0,Math.min(seconds,audioStatus.duration))); }
  function skipAudioChapter(direction:-1|1) {
    let nextChapter=chapter+direction,nextBook=book;
    if(nextChapter<1){const index=BOOKS.findIndex(item=>item.id===book.id);if(index>0){nextBook=BOOKS[index-1];nextChapter=nextBook.chapters; } else return;}
    if(nextChapter>nextBook.chapters){const index=BOOKS.findIndex(item=>item.id===book.id);if(index<BOOKS.length-1){nextBook=BOOKS[index+1];nextChapter=1;}else return;}
    openAudioChapter(nextBook,nextChapter,true,audioReader);
  }

  useEffect(()=>{
    if(audioStatus.didJustFinish && audioAutoNext && tab==="audio") skipAudioChapter(1);
  },[audioStatus.didJustFinish,audioAutoNext,tab]);

  return <SafeAreaView style={[s.safe,(tab==="home"||tab==="notes")&&s.safeHome]}>
    <StatusBar barStyle={(tab==="home"||tab==="plan"||tab==="notes")?"light-content":"dark-content"} backgroundColor={(tab==="home"||tab==="plan"||tab==="notes")?"#002D28":C.pale}/>
    <ScrollView style={s.body} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={true} nestedScrollEnabled={true}>
      {tab==="home"&&<>
        <View style={s.homePage}>
          <Svg width="100%" height="100%" viewBox="0 0 400 900" preserveAspectRatio="none" style={s.homePageGradient}>
            <Defs>
              <LinearGradient id="homePageGradientFill" x1="0%" y1="0%" x2="0%" y2="100%">
                <Stop offset="0%" stopColor="#002D28"/>
                <Stop offset="56%" stopColor="#004B40"/>
                <Stop offset="100%" stopColor="#007B66"/>
              </LinearGradient>
            </Defs>
            <Rect x="0" y="0" width="400" height="900" fill="url(#homePageGradientFill)"/>
          </Svg>
          <ImageBackground
            source={require("./assets/home/header-cross.jpg")}
            style={s.homeHeader}
            imageStyle={{width:"100%",height:"100%",resizeMode:"stretch"}}
            resizeMode="stretch"
            accessibilityLabel="Cross और पवित्र बाइबल का मुख्य बैनर"
          >
            <Pressable onPress={()=>changeTab("settings")} style={s.homeSettingsButton} accessibilityRole="button" accessibilityLabel="सेटिंग्स खोलें">
              <Text style={s.homeSettingsIcon}>⚙</Text>
            </Pressable>
          </ImageBackground>

          <Pressable style={s.homeHero} onPress={()=>openChapter(BOOKS[0],1)} accessibilityRole="button">
            <Image source={require("./assets/home/open-bible.jpg")} style={{position:"absolute",top:0,right:0,bottom:0,left:0,width:"100%",height:"100%",zIndex:0}} resizeMode="cover"/>
            <View style={s.homeHeroShade}/>
            <View style={s.homeHeroCopy}>
              <Text style={s.homeEyebrow}>आज का आमंत्रण</Text>
              <Text style={s.homeTitle}>पवित्र बाइबल पढ़ें</Text>
              <Text style={s.homeSub}>उत्पत्ति 1 से शुरू करें</Text>
              <View style={s.heroButton}>
                <Text style={s.heroButtonText}>पढ़ना शुरू करें  ›</Text>
              </View>
            </View>
            <View style={s.homeHeroCorner}><Text style={s.homeHeroCornerText}>GENESIS 01</Text></View>
          </Pressable>

          <View style={s.featureGrid}>
            {[
              {icon:"audio",label:"ऑडियो बाइबल",description:"वचन को सुनें",action:"audio",accent:"#20E5A4",halo:"#073F35"},
              {icon:"search",label:"वचन खोजें",description:"किसी भी वचन को खोजें",action:"search",accent:"#42D8F5",halo:"#102F4D"},
              {icon:"bookmark",label:"बुकमार्क",description:"पसंदीदा वचन सहेजें",action:"saved",accent:"#F4C95D",halo:"#4A3A13"},
              {icon:"plan",label:"पढ़ने की योजना",description:"अपनी दैनिक पढ़ाई पूरी करें",action:"plan",accent:"#C68BFF",halo:"#392052"},
              {icon:"notes",label:"नोट्स",description:"अपने विचार लिखें",action:"notes",accent:"#F5B64D",halo:"#4A3216"},
              {icon:"study",label:"बाइबल अध्ययन",description:"गहराई से समझें",action:"soon",accent:"#41D8F3",halo:"#123B50"}
            ].map(item=>{
              const cardContent=<>
                <Svg width="100%" height={43} viewBox="0 0 150 43" preserveAspectRatio="none" style={s.featureWave}>
                  <Path d="M-8 37 C 18 14, 37 48, 66 28 S 116 10, 158 31" stroke={item.accent} strokeWidth="1.1" fill="none" opacity=".45"/>
                  <Path d="M-8 43 C 24 20, 45 52, 78 34 S 124 19, 158 37" stroke={item.accent} strokeWidth=".8" fill="none" opacity=".28"/>
                </Svg>
                <View style={[s.featureIconHalo,{borderColor:item.accent,backgroundColor:item.halo,shadowColor:item.accent}]}>
                  <HomeFeatureIcon name={item.icon as HomeIconName} color={item.accent}/>
                </View>
                <Text style={s.featureLabel}>{item.label}</Text>
                <Text style={s.featureSub}>{item.description}</Text>
              </>;
              if(item.action==="audio") return <Pressable key={item.label} style={[s.featureCard,{borderColor:"#20E5A4",backgroundColor:"#043B33"}]} onPress={()=>openAudioChapter(book,chapter)} accessibilityRole="button">{cardContent}</Pressable>;
              if(item.action==="search") return <Pressable key={item.label} style={[s.featureCard,{borderColor:"#42D8F5",backgroundColor:"#043B33"}]} onPress={()=>changeTab("search")} accessibilityRole="button">{cardContent}</Pressable>;
              if(item.action==="saved") return <Pressable key={item.label} style={[s.featureCard,{borderColor:"#F4C95D",backgroundColor:"#043B33"}]} onPress={()=>changeTab("saved")} accessibilityRole="button">{cardContent}</Pressable>;
              if(item.action==="plan") return <Pressable key={item.label} style={[s.featureCard,{borderColor:item.accent,backgroundColor:"#043B33"}]} onPress={()=>changeTab("plan")} accessibilityRole="button">{cardContent}</Pressable>;
              if(item.action==="notes") return <Pressable key={item.label} style={[s.featureCard,{borderColor:item.accent,backgroundColor:"#043B33"}]} onPress={()=>changeTab("notes")} accessibilityRole="button">{cardContent}</Pressable>;
              return <View key={item.label} style={[s.featureCard,{borderColor:item.accent,backgroundColor:"#043B33"}]}>{cardContent}</View>;
            })}
          </View>
          <View style={s.homeFooterDecor}><View style={s.homeFooterLine}/><Text style={s.homeFooterCross}>✝</Text><View style={s.homeFooterLine}/></View><Text style={s.homeFooter}>परमेश्वर का वचन आपके जीवन में शांति और आशा लाए।</Text>
        </View>
      </>}

      {tab==="bible"&&<>
        <View style={s.innerHomeBar}>
          <Pressable onPress={()=>changeTab("home")} style={s.innerHomeButton} accessibilityRole="button" accessibilityLabel="होम पेज पर वापस जाएँ">
            <Text style={s.innerHomeIcon}>⌂</Text><Text style={s.innerHomeText}>होम पर जाएँ</Text>
          </Pressable>
          <Text style={s.innerPageTag}>पवित्र बाइबल</Text>
        </View>
        <View style={s.readerHeader}>
          <Pressable onPress={()=>setDrawer(true)} style={s.headerAction}><Text style={s.headerActionText}>☰</Text></Pressable>
          <Pressable onPress={()=>openPicker("CHAPTER")} style={s.bookChapter}><Text style={s.bookChapterText}>{book.hindi} {chapter}　⌄</Text></Pressable>
          <Pressable onPress={()=>speaking?stopSpeech():speakFrom(0)} style={s.headerAction}><Text style={s.headerActionText}>{speaking?"Ⅱ":"▶"}</Text></Pressable>
          <Pressable onPress={()=>changeTab("home")} style={s.headerAction}><Text style={s.headerActionText}>⌂</Text></Pressable>
          <Pressable onPress={()=>changeTab("settings")} style={s.headerAction}><Text style={s.headerActionText}>⚙</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chapterStrip} contentContainerStyle={s.chapterStripContent}>
          {chapterNumbers.map(n=><Pressable key={n} onPress={()=>openChapter(book,n)} style={[s.chapterPill,n===chapter&&s.chapterPillActive]}><Text style={[s.chapterPillText,n===chapter&&s.chapterPillTextActive]}>{n}</Text></Pressable>)}
        </ScrollView>
        <View style={s.readerActions}>
          <Text style={s.readerTitle}>{book.hindi} {chapter}</Text>
          <View style={s.inlineActions}><Pressable onPress={toggleBookmark}><Text style={s.inlineActionText}>{currentSaved?"★ सेव":"☆ सेव करें"}</Text></Pressable><Pressable onPress={()=>openPicker("BOOK")}><Text style={s.inlineActionText}>पुस्तक चुनें</Text></Pressable></View>
        </View>
        {loading&&<ActivityIndicator color={C.blue} size="large" style={{margin:24}}/>}
        {!!error&&<Text style={s.error}>{error}</Text>}
        {!passage&&!loading&&!error&&<View style={s.emptyBox}><Text style={s.emptyTitle}>बाइबल पढ़ना शुरू करें</Text><Text style={s.muted}>ऊपर से पुस्तक और अध्याय चुनें।</Text><Button label="पुस्तक चुनें" onPress={()=>openPicker("BOOK")}/></View>}
        {passage&&<View style={s.verseList}>
          {verseList.map((v,i)=><Pressable key={v.number||i} onPress={()=>selectVerseAndShowActions(v.number||i+1)} {...({onContextMenu:(event:any)=>{event.preventDefault?.();selectVerseAndShowActions(v.number||i+1);}} as any)} style={[s.verseRow,speaking&&speechVerse===i&&s.verseActive,selectedVerse===(v.number||i+1)&&s.verseSelected,verseHighlights[`${book.id}.${chapter}.${v.number||i+1}`]?{backgroundColor:verseHighlights[`${book.id}.${chapter}.${v.number||i+1}`]}:null]}>
            {v.number>0&&<Text style={[s.verseNumber,selectedVerse===(v.number||i+1)&&s.verseSelectedText]}>{v.number}</Text>}
            <Text style={[s.verseText,{fontSize:Math.min(fontSize,19),lineHeight:Math.min(fontSize,19)*1.55},selectedVerse===(v.number||i+1)&&s.verseSelectedText]}>{v.text}</Text>{notes.some(item=>item.kind==="verse"&&item.reference?.bookId===book.id&&item.reference.chapter===chapter&&item.reference.verse===(v.number||i+1))&&<Text style={s.verseNoteIndicator}>✎</Text>}
          </Pressable>)}
          <Text style={s.copyright}>{passage.reference} • {passage.copyright||"अनुवाद का लाइसेंस और श्रेय Settings में देखें।"}</Text>
        </View>}

      </>}

      {tab==="audio"&&<>
        <View style={s.innerHomeBar}>
          <Pressable onPress={()=>changeTab("home")} style={s.innerHomeButton} accessibilityRole="button" accessibilityLabel="होम पेज पर वापस जाएँ">
            <Text style={s.innerHomeIcon}>⌂</Text><Text style={s.innerHomeText}>होम पर जाएँ</Text>
          </Pressable>
          <Text style={s.innerPageTag}>ऑडियो बाइबल</Text>
        </View>
        <View style={s.readerHeader}>
          <Text style={[s.readerTitle,{flex:1,textAlign:"center"}]}>ऑडियो बाइबल</Text>
          <Pressable onPress={()=>openPicker("BOOK")} style={s.headerAction}><Text style={s.headerActionText}>☰</Text></Pressable>
        </View>
        <View style={s.audioPanel}>
          <Text style={s.kicker}>RECORDED HINDI AUDIO</Text>
          <Text style={s.audioTitle}>{book.hindi} – अध्याय {chapter}</Text>
          <Text style={s.muted}>आपकी चुनी हुई हिंदी बाइबल Translation की वास्तविक Recording</Text>
          <View style={s.inlineActions}>
            <Button label="पुस्तक / अध्याय बदलें" outline onPress={()=>openPicker("BOOK")}/>
            <Button label="अध्याय फिर लोड करें" outline onPress={()=>openAudioChapter(book,chapter)}/>
          </View>
          {audioLoading&&<ActivityIndicator color={C.blue} size="large" style={{margin:18}}/>}
          {!!audioError&&<Text style={s.error}>{audioError}</Text>}
          {!audioLoading&&audioItems.length>0&&<>
            <Text style={s.audioLabel}>आवाज़ / Reader</Text>
            <View style={s.readerChoices}>{audioItems.map(item=><Pressable key={item.readerId} onPress={()=>changeAudioReader(item.readerId)} style={[s.readerChoice,item.readerId===audioReader&&s.readerChoiceActive]}><Text style={[s.readerChoiceText,item.readerId===audioReader&&{color:C.white}]}>{item.readerId}</Text></Pressable>)}</View>
            <View style={s.audioProgressRow}><Text style={s.muted}>{formatTime(audioStatus.currentTime)}</Text><Text style={s.muted}>{formatTime(audioStatus.duration)}</Text></View>
            <Pressable onLayout={event=>setAudioTrackWidth(Math.max(1,event.nativeEvent.layout.width))} onPress={event=>seekAudio((event.nativeEvent.locationX/audioTrackWidth)*audioStatus.duration)} style={s.audioProgress}><View style={[s.audioProgressFill,{width:`${audioStatus.duration?Math.min(100,audioStatus.currentTime/audioStatus.duration*100):0}%`}]} /></Pressable>
            <View style={s.audioControls}>
              <Pressable onPress={()=>seekAudio(audioStatus.currentTime-15)} style={s.audioControl}><Text style={s.audioControlText}>−15</Text></Pressable>
              <Pressable onPress={()=>skipAudioChapter(-1)} style={s.audioControl}><Text style={s.audioControlText}>|◀</Text></Pressable>
              <Pressable onPress={()=>audioStatus.playing?audioPlayer.pause():playAudio()} style={s.audioPlay}><Text style={s.audioPlayText}>{audioStatus.playing?"Ⅱ":"▶"}</Text></Pressable>
              <Pressable onPress={()=>skipAudioChapter(1)} style={s.audioControl}><Text style={s.audioControlText}>▶|</Text></Pressable>
              <Pressable onPress={()=>seekAudio(audioStatus.currentTime+15)} style={s.audioControl}><Text style={s.audioControlText}>+15</Text></Pressable>
            </View>
            <View style={s.inlineActions}>
              <Button label={`गति ${audioRate}x`} outline onPress={()=>{const rates=[0.75,1,1.25,1.5,2];const next=rates[(rates.indexOf(audioRate)+1)%rates.length];setAudioRate(next);audioPlayer.setPlaybackRate(next);}}/>
              <Button label={audioAutoNext?"Auto Next: ON":"Auto Next: OFF"} outline onPress={()=>setAudioAutoNext(v=>!v)}/>
              <Button label={audioDownloaded?"Offline Saved":Platform.OS==="web"?"Download MP3":"Download Offline"} outline onPress={downloadAudio}/>
            </View>
            {selectedAudio.timings?.length
              ? <Text style={s.audioHint}>वचन के साथ Audio Sync उपलब्ध है। किसी वचन को चुनने पर Audio उसी समय से चलेगा।</Text>
              : <Text style={s.audioHint}>इस Recording में Verse Timing उपलब्ध नहीं है; Audio Player सामान्य Chapter Playback करेगा।</Text>}
          </>}
          {!audioLoading&&!audioItems.length&&!audioError&&<Text style={s.muted}>Audio खोजने के लिए पुस्तक और अध्याय चुनें।</Text>}
        </View>
        {passage&&verseList.length>0&&<View style={s.verseList}>
          <Text style={s.sectionTitle}>साथ में पढ़ें</Text>
          {verseList.map((v,i)=><Pressable key={v.number||i} onPress={()=>{if(selectedAudio?.timings?.[i]!==undefined){seekAudio(selectedAudio.timings[i]);setAudioVerse(i);playAudio();}else setAudioVerse(i);}} style={[s.verseRow,(syncedVerse===i||audioVerse===i)&&s.verseActive]}>
            {v.number>0&&<Text style={s.verseNumber}>{v.number}</Text>}
            <Text style={[s.verseText,{fontSize:Math.min(fontSize,19),lineHeight:Math.min(fontSize,19)*1.55}]}>{v.text}</Text>
          </Pressable>)}
        </View>}
      </>}

      {tab==="search"&&<>
        <View style={s.innerHomeBar}>
          <Pressable onPress={()=>changeTab("home")} style={s.innerHomeButton} accessibilityRole="button" accessibilityLabel="होम पेज पर वापस जाएँ">
            <Text style={s.innerHomeIcon}>⌂</Text><Text style={s.innerHomeText}>होम पर जाएँ</Text>
          </Pressable>
        </View>
        <Text style={s.pageHeading}>वचन खोजें</Text>
        <Text style={s.muted}>चुनी हुई हिंदी बाइबल में कोई शब्द, वाक्यांश या वचन Reference खोजें।</Text>
        <TextInput value={query} onChangeText={value=>{setQuery(value);setError("");}} onSubmitEditing={runSearch} returnKeyType="search" placeholder="जैसे: प्रेम, विश्वास, परमेश्वर या यूहन्ना 3:16" placeholderTextColor={C.muted} style={s.searchInput}/>
        <Button label={loading?"खोज हो रही है…":"खोजें"} onPress={runSearch} disabled={loading||!query.trim()}/>
        {loading&&<View style={s.searchLoading}><ActivityIndicator color={C.blue} size="large"/><Text style={s.muted}>पहली खोज में पूरी बाइबल का पाठ लोड हो सकता है। कृपया खोज पूरी होने दें।</Text></View>}
        {!!error&&<Text style={s.error}>{error}</Text>}
        {searchAttempted&&!loading&&results.length>0&&<Text style={s.searchResultCount}>{results.length} परिणाम मिले{results.length===100?" (पहले 100 परिणाम)":""}</Text>}
        {searchAttempted&&!loading&&!error&&results.length===0&&<Text style={s.emptyBox}>इस शब्द या वाक्यांश के लिए कोई वचन नहीं मिला। दूसरा शब्द आज़माएँ।</Text>}
        {results.map((r,i)=><Pressable key={r.reference+i} style={s.resultCard} onPress={()=>openReference(r.reference)}>
          <Text style={s.dailyRef}>{r.passage?.reference||r.reference}</Text>
          <Text style={s.resultText}>{r.passage?.content||"वचन खोलें"}</Text>
          <Text style={s.searchOpenHint}>वचन खोलें →</Text>
        </Pressable>)}
      </>}

      {tab==="plan"&&<>
        <View style={s.planPage}>
          <ImageBackground source={require("./assets/reading-plan/plan-header.jpg")} style={s.planHeroImage} imageStyle={{width:"100%",height:"100%",resizeMode:"stretch"}} resizeMode="stretch" accessibilityLabel="पढ़ने की योजना का Cross और Bible वाला banner">
            <Pressable onPress={()=>changeTab("home")} style={s.planHeroHomeHitbox} accessibilityRole="button" accessibilityLabel="होम पेज पर वापस जाएँ"/>
          </ImageBackground>
          {!planProgress?<>
            <View style={s.planWelcomeCard}>
              <Text style={s.planWelcomeTitle}>अपनी बाइबल पढ़ने की यात्रा शुरू करें</Text>
              <Text style={s.planWelcomeText}>एक योजना चुनें, रोज़ के अध्याय पढ़ें और अपनी प्रगति सुरक्षित रखें।</Text>
            </View>
            <Text style={s.planSectionHeading}>उपलब्ध योजनाएँ</Text>
            {READING_PLAN_TEMPLATES.map((item,index)=><Pressable key={item.id} onPress={()=>{setPlanSelectedId(item.id);setPlanMessage("");}} style={[s.planTemplateCard,planSelectedId===item.id&&s.planTemplateActive]}>
              <View style={s.planTemplateIcon}><Text style={s.planTemplateIconText}>{["📖","✝","♫","✦"][index]}</Text></View>
              <View style={{flex:1,minWidth:0}}>
                <Text style={s.planTemplateTitle}>{item.title}</Text>
                <Text style={s.planTemplateSubtitle}>{item.subtitle}</Text>
                <Text style={s.planTemplateDescription}>{item.description}</Text>
              </View>
              <Text style={s.planRadio}>{planSelectedId===item.id?"●":"○"}</Text>
            </Pressable>)}
            <View style={s.planDetailsCard}>
              <Text style={s.planDetailsEyebrow}>SELECTED PLAN</Text>
              <Text style={s.planDetailsTitle}>{selectedPlanTemplate.title}</Text>
              <Text style={s.muted}>{selectedPlanTemplate.description}</Text>
              <Button label="योजना शुरू करें" onPress={()=>startReadingPlan(selectedPlanTemplate.id)}/>
            </View>
          </>:!activePlanTemplate?<View style={s.emptyBox}><Text style={s.emptyTitle}>योजना उपलब्ध नहीं</Text><Text style={s.muted}>सेव की गई योजना की जानकारी नहीं मिली। इसे बंद करके नई योजना चुनें।</Text><Button label="योजना हटाएँ" onPress={stopReadingPlan}/></View>:<>
            <View style={s.planSummaryCard}>
              <View style={s.planSummaryTop}>
                <Image source={require("./assets/home/open-bible.jpg")} style={{width:65,height:70,borderRadius:14,borderWidth:1.2,borderColor:"#D4B65C"}} resizeMode="cover"/>
                <View style={s.planSummaryCopy}>
                  <View style={s.planActivePill}><Text style={s.planActivePillText}>आपकी सक्रिय योजना</Text></View>
                  <Text style={s.planSummaryTitle}>{activePlanTemplate.title}</Text>
                  <View style={s.planMetaLine}><Text style={s.planMetaIcon}>▦</Text><Text style={s.planSummaryMeta}>शुरू: {planProgress.startDate}</Text></View>
                  <View style={s.planMetaLine}><Text style={s.planMetaIcon}>▣</Text><Text style={s.planSummaryMeta}>दिन {planTodayIndex}/{activePlanTemplate.durationDays}</Text></View>
                </View>
                <View style={s.planRingWrap}>
                  <Svg width={72} height={72} viewBox="0 0 100 100">
                    <Circle cx="50" cy="50" r="42" fill="none" stroke="#276F5D" strokeWidth="10"/>
                    <Circle cx="50" cy="50" r="42" fill="none" stroke="#46D7A7" strokeWidth="10" strokeLinecap="round" strokeDasharray="264" strokeDashoffset={264-(264*planProgressPercent/100)} transform="rotate(-90 50 50)"/>
                  </Svg>
                  <Text style={s.planRingLabel}>{planProgressPercent}%</Text>
                </View>
              </View>
              <View style={s.planProgressTrack}><View style={[s.planProgressFill,{width:`${planProgressPercent}%`}]}/></View>
              <View style={s.planProgressNumbers}>
                <Text style={s.planProgressText}>{planCompletedCount} / {planTotalChapters} अध्याय पूरे</Text>
                <Text style={s.planProgressPercent}>{planProgressPercent}%</Text>
              </View>
              {planProgressPercent===100&&<Text style={s.planFinishedText}>बधाई! आपने इस योजना के सभी अध्याय पूरे कर लिए हैं।</Text>}
            </View>
            <View style={s.planDayNavigator}>
              <Pressable disabled={planDisplayDay<=1} onPress={()=>{setPlanViewedDay(planDisplayDay-1);setPlanMessage("");}} style={[s.planDayArrow,planDisplayDay<=1&&s.planDayArrowDisabled]}><Text style={s.planDayArrowText}>‹ पिछला</Text></Pressable>
              <View style={s.planDayCenter}>
                <Text style={s.planDayCalendar}>▦</Text>
                <Text style={s.planDayNumber}>दिन {planDisplayDay}</Text>
                <Text style={s.planDayHint}>{planDisplayDay===planTodayIndex?"आज की पढ़ाई":planDisplayDay<planTodayIndex?"पिछली पढ़ाई":"आने वाली पढ़ाई"}</Text>
              </View>
              <Pressable disabled={planDisplayDay>=activePlanTemplate.durationDays} onPress={()=>{setPlanViewedDay(planDisplayDay+1);setPlanMessage("");}} style={[s.planDayArrow,s.planDayArrowNext,planDisplayDay>=activePlanTemplate.durationDays&&s.planDayArrowDisabled]}><Text style={s.planDayArrowNextText}>अगला ›</Text></Pressable>
            </View>
            <View style={s.planDayCard}>
              <View style={s.planDayCardHead}>
                <View style={s.planBookBadge}><Text style={s.planBookBadgeText}>📖</Text></View>
                <View style={s.planDayHeadCopy}>
                  <Text style={s.planDayCardTitle}>इस दिन के Bible Chapters</Text>
                  <Text style={s.planDayCardSubtitle}>{displayedPlanDay?.chapters.length||0} अध्याय • पूरा होने पर टिक करें</Text>
                </View>
                <View style={[s.planDayStatus,displayedDayComplete&&s.planDayStatusDone]}>
                  <Text style={[s.planDayStatusText,displayedDayComplete&&s.planDayStatusTextDone]}>{displayedDayComplete?"✓ पूरा हुआ":"◷ बाकी है"}</Text>
                </View>
              </View>
              {displayedPlanDay?.chapters.map(item=>{
                const done=planCompletedSet.has(item.id);
                return <View key={item.id} style={[s.planChapterRow,done&&s.planChapterRowDone]}>
                  <View style={s.planChapterIconTile}><Text style={s.planChapterIcon}>📖</Text></View>
                  <Pressable onPress={()=>openPlanChapter(item)} style={s.planChapterCopy} accessibilityRole="button">
                    <Text style={[s.planChapterTitle,done&&s.planChapterTitleDone]}>{item.bookHindi} {item.chapter}</Text>
                    <Text style={s.planChapterSubtitle}>{item.bookEnglish} {item.chapter}  •  अध्याय पढ़ें</Text>
                  </Pressable>
                  <Text style={s.planChapterChevron}>›</Text>
                  <Pressable onPress={()=>togglePlanChapter(item.id)} style={[s.planChapterCheck,done&&s.planChapterCheckDone]} accessibilityRole="checkbox" accessibilityState={{checked:done}} accessibilityLabel={done?"पढ़ाई अधूरी चिह्नित करें":"पढ़ाई पूरी चिह्नित करें"}>
                    <Text style={[s.planChapterCheckText,done&&s.planChapterCheckTextDone]}>{done?"✓":""}</Text>
                  </Pressable>
                </View>;
              })}
              <Pressable style={[s.planCompleteButton,displayedDayComplete&&s.planCompleteButtonDone]} onPress={completeDisplayedPlanDay} disabled={displayedDayComplete||!displayedPlanDay?.chapters.length} accessibilityRole="button">
                <Text style={s.planCompleteIcon}>✓</Text>
                <Text style={s.planCompleteButtonText}>{displayedDayComplete?"इस दिन की पढ़ाई पूरी हो गई":"इस दिन की सभी पढ़ाइयाँ पूरी करें"}</Text>
              </Pressable>
            </View>
            <View style={s.planActionRow}>
              <Pressable style={s.planBottomAction} onPress={()=>{setPlanViewedDay(planTodayIndex);setPlanMessage("");}}><Text style={s.planBottomActionIcon}>▦</Text><Text style={s.planBottomActionText}>आज पर लौटें</Text></Pressable>
              <Pressable style={s.planBottomAction} onPress={catchUpReadingPlan}><Text style={s.planBottomActionIcon}>📖</Text><Text style={s.planBottomActionText}>अधूरी पढ़ाई पर जाएँ</Text></Pressable>
            </View>
            {!!planMessage&&<Text style={s.planFeedback}>{planMessage}</Text>}
            <View style={s.planManageRow}>
              {!planConfirmStop?<Pressable onPress={()=>setPlanConfirmStop(true)}><Text style={s.planManageLink}>योजना समाप्त करें</Text></Pressable>:<>
                <Text style={s.planConfirmText}>क्या आप यह योजना बंद करना चाहते हैं? सेव Progress हट जाएगी।</Text>
                <View style={s.planConfirmActions}>
                  <Pressable onPress={()=>setPlanConfirmStop(false)}><Text style={s.planManageLink}>नहीं, वापस जाएँ</Text></Pressable>
                  <Pressable onPress={stopReadingPlan}><Text style={s.planStopLink}>हाँ, समाप्त करें</Text></Pressable>
                </View>
              </>}
            </View>
            <Svg width="100%" height="42" viewBox="0 0 400 42" preserveAspectRatio="none" style={s.planBottomWave}>
              <Path d="M0 18 C70 -2 110 44 180 22 S310 5 400 24 L400 42 L0 42Z" fill="#B9E8D4" opacity=".7"/>
              <Path d="M0 28 C70 8 120 51 200 31 S325 12 400 32 L400 42 L0 42Z" fill="#E0F7EA" opacity=".95"/>
            </Svg>
          </>}
          {!!planMessage&&!planProgress&&<Text style={s.planFeedback}>{planMessage}</Text>}
        </View>
      </>}
      {tab==="saved"&&<>
        <View style={s.innerHomeBar}>
          <Pressable onPress={()=>changeTab("home")} style={s.innerHomeButton} accessibilityRole="button" accessibilityLabel="होम पेज पर वापस जाएँ">
            <Text style={s.innerHomeIcon}>⌂</Text><Text style={s.innerHomeText}>होम पर जाएँ</Text>
          </Pressable>
          <Text style={s.innerPageTag}>बुकमार्क</Text>
        </View>
        <Text style={s.pageHeading}>सेव किए गए वचन</Text><Text style={s.sectionTitle}>बुकमार्क ({bookmarks.length})</Text>
        {bookmarks.map(x=><Pressable key={x.id} style={s.savedRow} onPress={()=>openChapter(BOOKS.find(b=>b.id===x.bookId)||BOOKS[0],x.chapter)}><Text style={s.cardTitle}>☆ {x.reference}</Text><Text style={s.muted}>अध्याय खोलें →</Text></Pressable>)}
        {!bookmarks.length&&<Text style={s.emptyBox}>अभी कोई बुकमार्क सेव नहीं है।</Text>}
        <Text style={s.sectionTitle}>हाल ही में पढ़े ({history.length})</Text>
        {history.map(x=><Pressable key={x.id} style={s.savedRow} onPress={()=>openChapter(BOOKS.find(b=>b.id===x.bookId)||BOOKS[0],x.chapter)}><Text style={s.cardTitle}>{x.reference}</Text><Text style={s.muted}>फिर से पढ़ें →</Text></Pressable>)}
      </>}

      {tab==="notes"&&<>
        <View style={s.notesPageV2}>
          <ImageBackground
            source={require("./assets/notes/notes-hero.jpg")}
            style={s.notesHeroV2}
            imageStyle={{width:"100%",height:"100%",resizeMode:"cover"}}
            resizeMode="cover"
            accessibilityLabel="Cross, mountains and open Bible at sunrise"
          >
            <View style={s.notesHeroOverlayV2}/>
            <View style={s.notesHeroNavV2}>
              <Pressable onPress={()=>changeTab("home")} style={s.notesHomePillV2} accessibilityRole="button" accessibilityLabel="होम पेज पर वापस जाएँ">
                <Text style={s.notesHomeIconV2}>⌂</Text>
                <Text style={s.notesHomeTextV2}>होम पर जाएँ</Text>
              </Pressable>
              <Text style={s.notesHeroTagV2}>MY BIBLE NOTES</Text>
            </View>
            <View style={s.notesHeroCopyV2}>
              <View style={s.notesHeroTitleRowV2}>
                <View style={s.notesHeroTitleIconV2}><HomeFeatureIcon name="notes" color="#F5C65B"/></View>
                <Text style={s.notesHeroTitleV2}>मेरे <Text style={s.notesHeroGoldV2}>नोट्स</Text></Text>
              </View>
              <Text style={s.notesHeroSubtitleV2}>अपने विचार, वचन से जुड़े नोट्स और बाइबल अध्ययन एक जगह सुरक्षित रखें। सभी नोट इस डिवाइस में सेव होते हैं।</Text>
              <View style={s.notesHeroUnderlineV2}/>
            </View>
          </ImageBackground>

          <View style={s.notesBodyV2}>
            <View style={s.notesSummaryV2}>
              <View style={s.notesSummaryTopV2}>
                <View style={s.notesSummaryIconV2}><HomeFeatureIcon name="notes" color="#F6CF64"/></View>
                <View style={s.notesSummaryCopyV2}>
                  <Text style={s.notesSummaryEyebrowV2}>आपकी नोट्स लाइब्रेरी</Text>
                  <Text style={s.notesSummaryTitleV2}>{notes.length} सेव किए गए नोट्स</Text>
                  <Text style={s.notesSummaryCaptionV2}>व्यक्तिगत विचार • वचन नोट्स • बाइबल अध्ययन</Text>
                </View>
                <View style={s.notesMiniChartV2}>
                  <View style={[s.notesMiniBarV2,{height:13,backgroundColor:"#C89A38"}]}/>
                  <View style={[s.notesMiniBarV2,{height:23,backgroundColor:"#DDB84D"}]}/>
                  <View style={[s.notesMiniBarV2,{height:33,backgroundColor:"#27B989"}]}/>
                </View>
              </View>
              <View style={s.notesHeroActionsV2}>
                <Pressable style={s.notesPrimaryButtonV2} onPress={()=>openNewNote("personal")} accessibilityRole="button">
                  <Text style={s.notesPrimaryButtonTextV2}>＋ नया नोट</Text>
                </Pressable>
                <Pressable style={s.notesSecondaryButtonV2} onPress={()=>openNewNote("study")} accessibilityRole="button">
                  <Text style={s.notesSecondaryButtonTextV2}>＋ Bible Study</Text>
                </Pressable>
              </View>
            </View>

            <View style={s.notesSearchV2}>
              <Text style={s.notesSearchIconV2}>⌕</Text>
              <TextInput
                value={noteQuery}
                onChangeText={setNoteQuery}
                placeholder="नोट का शीर्षक, वचन या शब्द खोजें…"
                placeholderTextColor="#6B8378"
                style={s.notesSearchInputV2}
                returnKeyType="search"
                accessibilityLabel="अपने नोट्स खोजें"
              />
              <Pressable onPress={()=>setNoteSortMenuVisible(!noteSortMenuVisible)} style={s.notesFilterButtonV2} accessibilityRole="button" accessibilityLabel="नोट्स क्रम बदलें">
                <Text style={s.notesFilterIconV2}>☷</Text>
              </Pressable>
            </View>

            {noteSortMenuVisible&&<View style={s.notesSortMenuV2}>
              <Text style={s.notesSortTitleV2}>नोट्स क्रमबद्ध करें</Text>
              {([{id:"newest",label:"नवीनतम पहले"},{id:"oldest",label:"पुराने पहले"},{id:"title",label:"शीर्षक के अनुसार"}] as {id:"newest"|"oldest"|"title";label:string}[]).map(item=><Pressable key={item.id} onPress={()=>{setNoteSortMode(item.id);setNoteSortMenuVisible(false);}} style={[s.notesSortOptionV2,noteSortMode===item.id&&s.notesSortOptionActiveV2]}>
                <Text style={[s.notesSortOptionTextV2,noteSortMode===item.id&&s.notesSortOptionTextActiveV2]}>{item.label}</Text>
                <Text style={s.notesSortTickV2}>{noteSortMode===item.id?"✓":""}</Text>
              </Pressable>)}
            </View>}

            <View style={s.notesCategoryGridV2}>
              {noteFilterOptions.map((item,index)=>{
                const iconName=(index===0?"bookmark":index===1?"notes":index===2?"bookmark":"study") as HomeIconName;
                const count=noteCategoryCounts[item as keyof typeof noteCategoryCounts];
                const active=noteFilter===item;
                return <Pressable key={item} onPress={()=>setNoteFilter(item)} style={[s.notesCategoryCardV2,active&&s.notesCategoryCardActiveV2]} accessibilityRole="button" accessibilityState={{selected:active}}>
                  <HomeFeatureIcon name={iconName} color={active?"#FFFFFF":"#087A5C"}/>
                  <Text style={[s.notesCategoryLabelV2,active&&s.notesCategoryLabelActiveV2]} numberOfLines={2}>{item}</Text>
                  <Text style={[s.notesCategoryCountV2,active&&s.notesCategoryCountActiveV2]}>({count})</Text>
                  {active&&<View style={s.notesCategoryActiveMarkV2}/>}
                </Pressable>;
              })}
            </View>

            <View style={s.notesListHeadingV2}>
              <View style={s.notesListTitleRowV2}>
                <Text style={s.notesListBookmarkV2}>▰</Text>
                <Text style={s.notesListTitleV2}>आपके नोट्स</Text>
              </View>
              <Text style={s.notesResultCountV2}>{filteredNotes.length} परिणाम</Text>
            </View>

            {filteredNotes.length===0?<View style={s.notesEmptyV2}>
              <View style={s.notesEmptyIconV2}><HomeFeatureIcon name="notes" color="#087A5C"/></View>
              <Text style={s.notesEmptyTitleV2}>{notes.length===0?"अभी कोई नोट नहीं है":"कोई नोट नहीं मिला"}</Text>
              <Text style={s.notesEmptyTextV2}>{notes.length===0?"नया नोट बनाएँ या Bible के किसी Verse से Notes जोड़ें।":"खोज या Category बदलकर फिर से देखें।"}</Text>
              {notes.length===0&&<Pressable style={s.notesEmptyButtonV2} onPress={()=>openNewNote("personal")}><Text style={s.notesEmptyButtonTextV2}>पहला नोट लिखें</Text></Pressable>}
            </View>:filteredNotes.map(item=>{
              const kindLabel=item.kind==="personal"?"व्यक्तिगत":item.kind==="verse"?"वचन नोट":"बाइबल अध्ययन";
              const iconName=(item.kind==="verse"?"bookmark":item.kind==="study"?"study":"notes") as HomeIconName;
              const isOpen=noteActionsOpenId===item.id;
              return <View key={item.id} style={[s.noteCardV2,item.kind==="personal"?s.noteCardPersonalV2:item.kind==="study"?s.noteCardStudyV2:s.noteCardVerseV2]}>
                <View style={s.noteCardMainV2}>
                  <View style={[s.noteCardIconV2,item.kind==="personal"?s.noteCardIconPersonalV2:item.kind==="study"?s.noteCardIconStudyV2:s.noteCardIconVerseV2]}>
                    <HomeFeatureIcon name={iconName} color={item.kind==="personal"?"#8555BD":item.kind==="study"?"#1565CB":"#087A5C"}/>
                  </View>
                  <Pressable onPress={()=>openEditNote(item)} style={s.noteCardCopyV2} accessibilityRole="button" accessibilityLabel={`नोट खोलें: ${item.title}`}>
                    <Text style={s.noteCardTitleV2} numberOfLines={1}>{item.title}</Text>
                    <Text style={s.noteCardExcerptV2} numberOfLines={2}>{item.content}</Text>
                    {!!item.reference&&<Text style={s.noteCardReferenceV2} numberOfLines={1}>{referenceLabel(item.reference)}</Text>}
                  </Pressable>
                  <Pressable onPress={()=>setNoteActionsOpenId(isOpen?null:item.id)} style={s.noteCardMoreV2} accessibilityRole="button" accessibilityLabel="नोट के विकल्प">
                    <Text style={s.noteCardMoreTextV2}>•••</Text>
                  </Pressable>
                </View>
                <View style={s.noteCardMetaV2}>
                  <View style={[s.noteKindPillV2,item.kind==="personal"?s.noteKindPersonalV2:item.kind==="study"?s.noteKindStudyV2:s.noteKindVerseV2]}>
                    <Text style={[s.noteKindPillTextV2,item.kind==="personal"?s.noteKindTextPersonalV2:item.kind==="study"?s.noteKindTextStudyV2:s.noteKindTextVerseV2]}>{kindLabel}</Text>
                  </View>
                  {!!item.tags.length&&<Text style={s.noteCardTagsV2} numberOfLines={1}>{item.tags.map(tag=>"#"+tag).join("  ")}</Text>}
                  <Text style={s.noteCardDateV2}>{new Date(item.updatedAt).toLocaleDateString("hi-IN",{day:"numeric",month:"short",year:"numeric"})}</Text>
                </View>
                {isOpen&&<View style={s.noteActionsMenuV2}>
                  <Pressable onPress={()=>{setNoteActionsOpenId(null);openEditNote(item);}} style={s.noteActionButtonV2}><Text style={s.noteActionTextV2}>✎ संपादित करें</Text></Pressable>
                  <Pressable onPress={()=>{setNoteActionsOpenId(null);shareNote(item);}} style={s.noteActionButtonV2}><Text style={s.noteActionTextV2}>↗ शेयर करें</Text></Pressable>
                  <Pressable onPress={()=>{setNoteActionsOpenId(null);setNoteDeleteConfirmId(item.id);}} style={s.noteActionDeleteV2}><Text style={s.noteActionDeleteTextV2}>⌫ हटाएँ</Text></Pressable>
                </View>}
                {noteDeleteConfirmId===item.id&&<View style={s.noteDeleteConfirmV2}>
                  <Text style={s.noteDeleteConfirmTextV2}>“{item.title}” को हटाएँ?</Text>
                  <View style={s.noteDeleteButtonsV2}>
                    <Pressable onPress={()=>setNoteDeleteConfirmId(null)}><Text style={s.noteDeleteCancelV2}>रद्द करें</Text></Pressable>
                    <Pressable onPress={()=>deleteNote(item)}><Text style={s.noteDeleteYesV2}>नोट हटाएँ</Text></Pressable>
                  </View>
                </View>}
              </View>;
            })}

            <View style={s.notesFabRowV2}>
              <Pressable onPress={()=>openNewNote("personal")} style={s.notesFabV2} accessibilityRole="button" accessibilityLabel="नया नोट बनाएँ">
                <Text style={s.notesFabPlusV2}>＋</Text>
              </Pressable>
            </View>

            <View style={s.notesBottomToolsV2}>
              <Pressable onPress={copyNotesBackup} style={s.notesBottomToolV2}><Text style={s.notesBottomToolIconV2}>☁</Text><Text style={s.notesBottomToolTextV2}>बैकअप</Text></Pressable>
              <Pressable onPress={openNotesImport} style={s.notesBottomToolV2}><Text style={s.notesBottomToolIconV2}>↓</Text><Text style={s.notesBottomToolTextV2}>आयात करें</Text></Pressable>
              <Pressable onPress={exportNotesBackup} style={s.notesBottomToolV2}><Text style={s.notesBottomToolIconV2}>↑</Text><Text style={s.notesBottomToolTextV2}>निर्यात करें</Text></Pressable>
              <Pressable onPress={()=>changeTab("settings")} style={s.notesBottomToolV2}><Text style={s.notesBottomToolIconV2}>⚙</Text><Text style={s.notesBottomToolTextV2}>सेटिंग्स</Text></Pressable>
            </View>
            <Text style={s.notesFooterV2}>नोट्स इसी डिवाइस पर सुरक्षित रहते हैं। नियमित Backup बनाकर अपने विचार सुरक्षित रखें।</Text>
          </View>
        </View>
      </>}
      {tab==="settings"&&<>
        <View style={s.innerHomeBar}>
          <Pressable onPress={()=>changeTab("home")} style={s.innerHomeButton} accessibilityRole="button" accessibilityLabel="होम पेज पर वापस जाएँ">
            <Text style={s.innerHomeIcon}>⌂</Text>
            <Text style={s.innerHomeText}>होम पर जाएँ</Text>
          </Pressable>
        </View>
        <Text style={s.pageHeading}>सेटिंग्स</Text><Text style={s.muted}>अपना हिंदी बाइबल अनुवाद देखें और आवाज़ तथा पढ़ने का आकार बदलें।</Text>
        <View style={s.settingsCard}>
          <Text style={s.sectionTitle}>हिंदी बाइबल अनुवाद</Text>
          {translationLoading?<ActivityIndicator color={C.blue} style={{margin:12}}/>:<>
            <Text style={s.muted}>वर्तमान में चुना गया अनुवाद</Text>
            <Text style={s.translationName}>{versions.find(item=>item.id===bibleId)?.title||bibleId||"अनुवाद उपलब्ध नहीं"}</Text>
            <Text selectable style={s.translationId}>Translation ID: {bibleId||"—"}</Text>
            {!!versions.find(item=>item.id===bibleId)?.copyright&&<Text style={s.muted}>{versions.find(item=>item.id===bibleId)?.copyright}</Text>}
            <Text style={[s.muted,{marginTop:14}]}>उपलब्ध हिंदी अनुवाद</Text>
            {versions.map(item=><Pressable key={item.id} onPress={()=>selectTranslation(item.id)} style={[s.translationOption,item.id===bibleId&&s.translationOptionActive]}>
              <View style={{flex:1}}><Text style={s.translationOptionTitle}>{item.title}</Text><Text selectable style={s.translationId}>{item.id}</Text></View>
              <Text style={s.translationCheck}>{item.id===bibleId?"✓ चुना हुआ":"चुनें"}</Text>
            </Pressable>)}
          </>}
          <Text style={s.sectionTitle}>Recorded Audio उपलब्धता</Text>
          <Text style={s.muted}>यह जाँच वर्तमान पुस्तक और अध्याय की Recorded Audio को चुने हुए अनुवाद में खोजती है।</Text>
          <Button label={audioAvailability==="checking"?"जाँच हो रही है…":`${book.hindi} अध्याय ${chapter} की Audio जाँचें`} onPress={checkSettingsAudio} disabled={audioAvailability==="checking"||!bibleId}/>
          {!!audioAvailabilityMessage&&<Text style={[s.audioAvailabilityMessage,audioAvailability==="available"?s.audioAvailable:audioAvailability==="unavailable"?s.audioUnavailable:s.audioCheckNeutral]}>{audioAvailabilityMessage}</Text>}
        </View>
        <View style={s.settingsCard}><Text style={s.sectionTitle}>आवाज़ और पढ़ना</Text><Text style={s.muted}>वचन सुनने के लिए Recorded Audio Bible उपलब्ध होने पर Audio Player इस्तेमाल करें। किसी अध्याय की Recording न मिले तो वचन सुनाने के लिए फोन की Hindi Text-to-Speech आवाज़ उपलब्ध है।</Text><View style={s.inlineActions}><Button label="आवाज़ जाँचें" onPress={()=>Speech.speak("आदि में परमेश्वर ने आकाश और पृथ्वी की सृष्टि की।",{language:"hi-IN",rate:.88})}/><Button label="आवाज़ रोकें" outline onPress={stopSpeech}/></View><Text style={s.muted}>अक्षर आकार: {fontSize}</Text><View style={s.inlineActions}><Button label="A−" outline onPress={()=>{const n=Math.max(16,fontSize-1);setFontSize(n);storage.setFontSize(n);}}/><Button label="A+" outline onPress={()=>{const n=Math.min(32,fontSize+1);setFontSize(n);storage.setFontSize(n);}}/></View></View>
        {loading&&<ActivityIndicator color={C.blue} style={{margin:16}}/>}
      </>}
    </ScrollView>

    <Modal visible={drawer} transparent animationType="slide" onRequestClose={()=>setDrawer(false)}>
      <View style={s.modalShade}><View style={s.drawer}>
        <View style={s.drawerHead}><Text style={s.drawerTitle}>Select the Book</Text><Pressable onPress={()=>setDrawer(false)}><Text style={s.closeText}>✕</Text></Pressable></View>
        <TextInput value={filter} onChangeText={setFilter} placeholder="पुस्तक खोजें" placeholderTextColor="#718096" style={s.drawerSearch}/>
        <ScrollView>{filteredBooks.map((b,i)=><Pressable key={b.id} onPress={()=>selectBook(b)} style={[s.drawerItem,b.id===book.id&&s.drawerItemActive]}><Text style={[s.drawerItemText,b.id===book.id&&{color:C.blue,fontWeight:"800"}]}>{i+1}. {b.hindi}</Text><Text style={s.drawerCount}>{b.chapters} अध्याय</Text></Pressable>)}</ScrollView>
      </View></View>
    </Modal>

    <Modal visible={picker} transparent animationType="fade" onRequestClose={()=>setPicker(false)}>
      <View style={s.modalShade}><View style={s.pickerPanel}>
        <View style={s.pickerHead}><Pressable onPress={()=>setPicker(false)} hitSlop={12}><Text style={s.closeText}>‹</Text></Pressable><Text style={s.pickerTitle}>{book.hindi} {chapter}</Text><Pressable onPress={()=>setPicker(false)}><Text style={s.cancelText}>Cancel</Text></Pressable></View>
        <View style={s.pickerTabs}>{(["BOOK","CHAPTER","VERSE"] as PickerTab[]).map(t=><Pressable key={t} onPress={()=>setPickerTab(t)} style={[s.pickerTab,pickerTab===t&&s.pickerTabActive]}><Text style={[s.pickerTabText,pickerTab===t&&{color:C.ink}]}>{t}</Text></Pressable>)}</View>
        {pickerTab==="BOOK"&&<ScrollView><View style={s.pickerBookList}>{BOOKS.map((b,i)=><Pressable key={b.id} onPress={()=>selectBook(b)} style={s.pickerBookItem}><Text style={s.pickerBookText}>{i+1}. {b.hindi}</Text><Text style={s.drawerCount}>{b.chapters} अध्याय</Text></Pressable>)}</View></ScrollView>}
        {pickerTab==="CHAPTER"&&<ScrollView contentContainerStyle={s.pickerGrid}>{chapterNumbers.map(n=><Pressable key={n} onPress={()=>tab==="audio"?openAudioChapter(book,n):openChapter(book,n)} style={[s.pickerNumber,n===chapter&&s.pickerNumberActive]}><Text style={[s.pickerNumberText,n===chapter&&{color:C.white}]}>{n}</Text></Pressable>)}</ScrollView>}
        {pickerTab==="VERSE"&&<ScrollView contentContainerStyle={s.pickerGrid}>{(verseNumbers.length?verseNumbers:Array.from({length:31},(_,i)=>i+1)).map(n=><Pressable key={n} onPress={()=>{setPicker(false);if(passage){setSpeechVerse(Math.max(0,verseList.findIndex(v=>v.number===n)));}}} style={[s.pickerNumber,n===speechVerse+1&&s.pickerNumberActive]}><Text style={[s.pickerNumberText,n===speechVerse+1&&{color:C.white}]}>{n}</Text></Pressable>)}</ScrollView>}
      </View></View>
    </Modal>

    {tab==="bible"&&verseMenuVisible&&selectedVerse!==null&&<View pointerEvents="box-none" style={s.verseActionOverlay}>
      <Pressable style={s.verseActionClose} onPress={()=>setVerseMenuVisible(false)} accessibilityRole="button" accessibilityLabel="वचन के विकल्प बंद करें"><Text style={s.verseActionCloseText}>×</Text></Pressable>
      <View style={s.verseActionRow}>
        <Pressable style={[s.verseActionLabel,{backgroundColor:"#7951C7"}]} onPress={openVerseImageShare}><Text style={s.verseActionLabelText}>Image Share</Text></Pressable>
        <Pressable style={[s.verseActionIcon,{backgroundColor:"#7951C7"}]} onPress={openVerseImageShare} accessibilityRole="button" accessibilityLabel="Image Share"><Text style={s.verseActionIconText}>▧＋</Text></Pressable>
      </View>
      <View style={s.verseActionRow}>
        <Pressable style={[s.verseActionLabel,{backgroundColor:"#087DF0"}]} onPress={shareSelectedVerse}><Text style={s.verseActionLabelText}>share Text</Text></Pressable>
        <Pressable style={[s.verseActionIcon,{backgroundColor:"#087DF0"}]} onPress={shareSelectedVerse} accessibilityRole="button" accessibilityLabel="Share Text"><Text style={s.verseActionIconText}>⌯</Text></Pressable>
      </View>
      <View style={s.verseActionRow}>
        <Pressable style={[s.verseActionLabel,{backgroundColor:"#743A2D"}]} onPress={toggleVerseBookmark}><Text style={s.verseActionLabelText}>Bookmark</Text></Pressable>
        <Pressable style={[s.verseActionIcon,{backgroundColor:"#743A2D"}]} onPress={toggleVerseBookmark} accessibilityRole="button" accessibilityLabel="Bookmark"><Text style={s.verseActionIconText}>▮</Text></Pressable>
      </View>
      <View style={s.verseActionRow}>
        <Pressable style={[s.verseActionLabel,{backgroundColor:"#E74742"}]} onPress={copySelectedVerse}><Text style={s.verseActionLabelText}>Copy</Text></Pressable>
        <Pressable style={[s.verseActionIcon,{backgroundColor:"#E74742"}]} onPress={copySelectedVerse} accessibilityRole="button" accessibilityLabel="Copy"><Text style={s.verseActionIconText}>▢</Text></Pressable>
      </View>
      <View style={s.verseActionRow}>
        <Pressable style={[s.verseActionLabel,{backgroundColor:"#E74799"}]} onPress={openVerseNote}><Text style={s.verseActionLabelText}>Notes</Text></Pressable>
        <Pressable style={[s.verseActionIcon,{backgroundColor:"#E74799"}]} onPress={openVerseNote} accessibilityRole="button" accessibilityLabel="Notes"><Text style={s.verseActionIconText}>✎</Text></Pressable>
      </View>
      <View style={s.verseActionRow}>
        <Pressable style={[s.verseActionLabel,{backgroundColor:"#168DE0"}]} onPress={toggleSelectedVerseHighlight}><Text style={s.verseActionLabelText}>{verseHighlights[activeVerseKey]?"Remove Highlight":"Highlight"}</Text></Pressable>
        <Pressable style={[s.verseActionIcon,{backgroundColor:"#168DE0"}]} onPress={toggleSelectedVerseHighlight} accessibilityRole="button" accessibilityLabel="Highlight"><Text style={s.verseActionIconText}>▤</Text></Pressable>
      </View>
      <View style={s.verseActionRow}>
        <Pressable style={[s.verseActionLabel,{backgroundColor:"#56235A"}]} onPress={()=>{setVerseMenuVisible(false);toggleBookmark();}}><Text style={s.verseActionLabelText}>Bookmark Chapter</Text></Pressable>
        <Pressable style={[s.verseActionIcon,{backgroundColor:"#56235A"}]} onPress={()=>{setVerseMenuVisible(false);toggleBookmark();}} accessibilityRole="button" accessibilityLabel="Bookmark Chapter"><Text style={s.verseActionIconText}>▮</Text></Pressable>
      </View>
      <View style={s.verseActionRow}>
        <Pressable style={[s.verseActionLabel,{backgroundColor:"#48A95B"}]} onPress={playSelectedVerse}><Text style={s.verseActionLabelText}>Audio Bible</Text></Pressable>
        <Pressable style={[s.verseActionIcon,{backgroundColor:"#48A95B"}]} onPress={playSelectedVerse} accessibilityRole="button" accessibilityLabel="Audio Bible"><Text style={s.verseActionIconText}>↻</Text></Pressable>
      </View>
    </View>}

    <Modal visible={imageShareVisible} transparent animationType="fade" onRequestClose={()=>setImageShareVisible(false)}>
      <View style={s.imageShareBackdrop}>
        <View style={s.imageSharePanel}>
          <View style={s.actionSheetHeader}>
            <View style={{flex:1}}><Text style={s.actionSheetTitle}>वचन की Image Share करें</Text><Text style={s.actionSheetSubtitle}>{activeVerseReference}</Text></View>
            <Pressable onPress={()=>setImageShareVisible(false)} hitSlop={12}><Text style={s.closeText}>✕</Text></Pressable>
          </View>
          <View ref={verseCardRef} collapsable={false} style={s.shareVerseCard}>
            <Text style={s.shareVerseBrand}>✝  HINDI BIBLE</Text>
            <Text style={s.shareVerseText}>{activeVerse?.text||""}</Text>
            <Text style={s.shareVerseReference}>{activeVerseReference}</Text>
            <Text style={s.shareVerseFooter}>परमेश्वर का वचन</Text>
          </View>
          <Pressable style={s.imageShareButton} onPress={shareVerseImage}><Text style={s.imageShareButtonText}>Image Share करें</Text></Pressable>
        </View>
      </View>
    </Modal>

    <Modal visible={noteModalVisible} transparent animationType="slide" onRequestClose={()=>setNoteModalVisible(false)}>
      <View style={s.actionScrim}>
        <ScrollView style={s.noteEditorScroll} contentContainerStyle={s.noteEditorScrollContent} keyboardShouldPersistTaps="handled">
          <View style={s.noteEditor}>
            <View style={s.actionSheetHeader}>
              <View style={{flex:1}}>
                <Text style={s.actionSheetTitle}>{editingNoteId?"नोट संपादित करें":"नया नोट लिखें"}</Text>
                <Text style={s.actionSheetSubtitle}>{noteReferenceDraft?referenceLabel(noteReferenceDraft):"आपके व्यक्तिगत विचार और Bible Study Notes"}</Text>
              </View>
              <Pressable onPress={()=>setNoteModalVisible(false)} hitSlop={12}><Text style={s.closeText}>✕</Text></Pressable>
            </View>
            <Text style={s.noteFieldLabel}>नोट का प्रकार</Text>
            <View style={s.noteKindChoices}>
              {([{id:"personal",label:"व्यक्तिगत"},{id:"verse",label:"वचन नोट"},{id:"study",label:"बाइबल अध्ययन"}] as {id:BibleNoteKind;label:string}[]).map(item=><Pressable key={item.id} onPress={()=>setNoteKindDraft(item.id)} style={[s.noteKindChoice,noteKindDraft===item.id&&s.noteKindChoiceActive]}>
                <Text style={[s.noteKindChoiceText,noteKindDraft===item.id&&s.noteKindChoiceTextActive]}>{item.label}</Text>
              </Pressable>)}
            </View>
            <Text style={s.noteFieldLabel}>शीर्षक</Text>
            <TextInput value={noteTitleDraft} onChangeText={setNoteTitleDraft} placeholder="जैसे: आज का बाइबल अध्ययन" placeholderTextColor={C.muted} style={s.noteTitleInput} maxLength={100}/>
            <Text style={s.noteFieldLabel}>आपका नोट</Text>
            <TextInput value={noteDraft} onChangeText={setNoteDraft} multiline placeholder="अपना विचार, प्रार्थना, सीखी हुई बात या अध्ययन लिखें…" placeholderTextColor={C.muted} style={s.noteEditorInput}/>
            <View style={s.noteReferenceEditorRow}>
              <View style={{flex:1}}>
                <Text style={s.noteFieldLabel}>Bible Reference (वैकल्पिक)</Text>
                <Text style={s.noteReferenceEditorValue}>{noteReferenceDraft?referenceLabel(noteReferenceDraft):"कोई वचन/अध्याय नहीं जोड़ा गया"}</Text>
              </View>
              <Pressable style={s.noteReferenceAddButton} onPress={addCurrentChapterReference}><Text style={s.noteReferenceAddText}>{noteReferenceDraft?"वर्तमान अध्याय":"＋ जोड़ें"}</Text></Pressable>
            </View>
            {!!noteReferenceDraft&&<Pressable onPress={()=>setNoteReferenceDraft(null)} style={s.noteReferenceRemove}><Text style={s.noteReferenceRemoveText}>Reference हटाएँ</Text></Pressable>}
            <Text style={s.noteFieldLabel}>Tags (Comma से अलग करें)</Text>
            <TextInput value={noteTagsDraft} onChangeText={setNoteTagsDraft} placeholder="प्रार्थना, विश्वास, सीख" placeholderTextColor={C.muted} style={s.noteTitleInput}/>
            <View style={s.noteEditorButtons}>
              <Pressable style={s.noteCancelButton} onPress={()=>setNoteModalVisible(false)}><Text style={s.noteCancelText}>रद्द करें</Text></Pressable>
              <Pressable style={[s.noteSaveButton,!noteDraft.trim()&&{opacity:.45}]} onPress={saveNote} disabled={!noteDraft.trim()}><Text style={s.noteSaveText}>नोट सेव करें</Text></Pressable>
            </View>
          </View>
        </ScrollView>
      </View>
    </Modal>

    <Modal visible={noteBackupModalVisible} transparent animationType="slide" onRequestClose={()=>setNoteBackupModalVisible(false)}>
      <View style={s.actionScrim}>
        <View style={s.noteEditor}>
          <View style={s.actionSheetHeader}>
            <View style={{flex:1}}>
              <Text style={s.actionSheetTitle}>Notes Backup Import</Text>
              <Text style={s.actionSheetSubtitle}>Hindi Bible का JSON Backup Paste करें</Text>
            </View>
            <Pressable onPress={()=>setNoteBackupModalVisible(false)} hitSlop={12}><Text style={s.closeText}>✕</Text></Pressable>
          </View>
          <Text style={s.noteBackupHint}>यह Import समान Note ID वाले नोट को Update करेगा और नए नोट जोड़ देगा। मौजूदा बाकी नोट हटेंगे नहीं।</Text>
          <TextInput value={noteImportDraft} onChangeText={setNoteImportDraft} multiline autoCapitalize="none" placeholder='{"format":"hindi-bible-notes","version":1,"notes":[]}' placeholderTextColor={C.muted} style={s.noteBackupInput}/>
          <View style={s.noteEditorButtons}>
            <Pressable style={s.noteCancelButton} onPress={()=>setNoteBackupModalVisible(false)}><Text style={s.noteCancelText}>रद्द करें</Text></Pressable>
            <Pressable style={[s.noteSaveButton,!noteImportDraft.trim()&&{opacity:.45}]} onPress={importNotesBackup} disabled={!noteImportDraft.trim()}><Text style={s.noteSaveText}>Backup Import करें</Text></Pressable>
          </View>
        </View>
      </View>
    </Modal>
  </SafeAreaView>;
}

const s=StyleSheet.create({
 audioPanel:{backgroundColor:C.white,borderRadius:18,padding:16,borderWidth:1,borderColor:C.line,marginTop:14},audioTitle:{fontSize:22,fontWeight:"900",color:C.ink,marginTop:8},audioLabel:{fontSize:13,fontWeight:"800",color:C.ink,marginTop:18,marginBottom:8},readerChoices:{flexDirection:"row",flexWrap:"wrap",gap:8},readerChoice:{paddingHorizontal:13,paddingVertical:9,borderRadius:20,borderWidth:1,borderColor:C.line,backgroundColor:"#F4F7FB"},readerChoiceActive:{backgroundColor:C.blue,borderColor:C.blue},readerChoiceText:{fontSize:12,color:C.ink,fontWeight:"800"},audioProgressRow:{flexDirection:"row",justifyContent:"space-between",marginTop:18},audioProgress:{height:7,backgroundColor:"#E1E8F0",borderRadius:8,overflow:"hidden",marginTop:5},audioProgressFill:{height:7,backgroundColor:C.blue,borderRadius:8},audioControls:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:18,marginBottom:10},audioControl:{minWidth:38,height:42,alignItems:"center",justifyContent:"center"},audioControlText:{fontSize:13,fontWeight:"800",color:C.ink},audioPlay:{width:58,height:58,borderRadius:29,backgroundColor:C.blue,alignItems:"center",justifyContent:"center"},audioPlayText:{fontSize:25,color:C.white,fontWeight:"900"},audioHint:{fontSize:11,color:C.muted,lineHeight:18,marginTop:12},
 safe:{flex:1,height:Platform.OS==="web"?"100%":undefined,minHeight:Platform.OS==="web"?"100%":undefined,width:"100%",maxWidth:480,alignSelf:"center",overflow:"hidden",backgroundColor:C.bg,paddingTop:Platform.OS==="android"?(StatusBar.currentHeight||24):Platform.OS==="web"?12:0},safeHome:{backgroundColor:"#002D28"},body:{flex:1,minHeight:0,width:"100%"},content:{flexGrow:1,padding:17,paddingBottom:28},homePage:{marginHorizontal:-17,marginTop:-17,paddingHorizontal:16,paddingTop:0,paddingBottom:28,backgroundColor:"#002D28",overflow:"hidden"},homePageGradient:{position:"absolute",top:0,right:0,bottom:0,left:0,zIndex:0},
homeHeader:{aspectRatio:4.33,alignSelf:"stretch",marginHorizontal:-16,marginBottom:12,overflow:"hidden",backgroundColor:"#002D28",justifyContent:"flex-end"},homeHeaderImage:{width:"100%",height:"100%",resizeMode:"stretch"},








homeSettingsButton:{position:"absolute",right:10,bottom:8,width:30,height:30,borderRadius:15,backgroundColor:"rgba(0,28,24,0.72)",borderWidth:1,borderColor:"rgba(255,255,255,0.65)",alignItems:"center",justifyContent:"center",zIndex:3},
homeSettingsIcon:{fontSize:15,color:"#FFFFFF"},


homeHero:{height:176,width:"100%",alignSelf:"stretch",borderRadius:20,overflow:"hidden",borderWidth:1.6,borderColor:"#F2C65B",marginBottom:18,justifyContent:"center",backgroundColor:"#211508",shadowColor:"#F1C65D",shadowOpacity:.18,shadowRadius:11,shadowOffset:{width:0,height:4},elevation:3},
homeHeroPhoto:{position:"absolute",top:0,right:0,bottom:0,left:0,width:"100%",height:"100%",zIndex:0},
homeHeroShade:{position:"absolute",top:0,right:0,bottom:0,left:0,backgroundColor:"rgba(7,12,8,0.48)",zIndex:1},
homeHeroCopy:{width:"64%",paddingHorizontal:17,paddingVertical:14,alignItems:"flex-start",zIndex:2},
homeEyebrow:{color:"#FFE3A3",fontSize:10,fontWeight:"900",letterSpacing:1.1},
homeTitle:{color:"#FFFFFF",fontSize:22,fontWeight:"900",lineHeight:30,marginTop:5,textShadowColor:"rgba(0,0,0,0.65)",textShadowOffset:{width:0,height:1},textShadowRadius:4},
homeSub:{color:"#FFF8E9",fontSize:13,lineHeight:19,marginTop:3,marginBottom:9,fontWeight:"600"},
heroButton:{backgroundColor:"#F4C85D",borderRadius:24,paddingHorizontal:17,paddingVertical:10,alignSelf:"flex-start",marginTop:3},
heroButtonText:{color:"#28200F",fontSize:13,fontWeight:"900"},
homeHeroCorner:{position:"absolute",right:12,bottom:12,borderRadius:12,backgroundColor:"rgba(0,35,30,0.66)",paddingHorizontal:10,paddingVertical:6},
homeHeroCornerText:{fontSize:9,color:"#FFF1CA",fontWeight:"900",letterSpacing:1},
featureGrid:{width:"100%",flexDirection:"row",flexWrap:"wrap",gap:11,justifyContent:"space-between",alignItems:"stretch"},
featureCard:{width:"31.25%",minHeight:124,backgroundColor:"rgba(0,44,38,0.94)",borderRadius:18,overflow:"hidden",alignItems:"center",justifyContent:"center",paddingHorizontal:5,paddingVertical:11,borderWidth:1.5,borderColor:"#12D5A0",shadowColor:"#12D5A0",shadowOpacity:.32,shadowRadius:10,shadowOffset:{width:0,height:3},elevation:5},featureWave:{position:"absolute",bottom:0,left:0,right:0,zIndex:0},
featureIconHalo:{width:55,height:55,borderRadius:28,borderWidth:1.7,alignItems:"center",justifyContent:"center",shadowColor:"#20E5A4",shadowOpacity:.75,shadowRadius:13,shadowOffset:{width:0,height:0},elevation:8,zIndex:1},
featureIcon:{fontSize:31,color:"#FFFFFF"},
featureLabel:{fontSize:13,fontWeight:"900",color:"#FFFFFF",marginTop:8,textAlign:"center",zIndex:1},
featureSub:{fontSize:10,color:"#D7EEE6",lineHeight:14,textAlign:"center",marginTop:4,zIndex:1},
comingSoon:{fontSize:8,fontWeight:"900",letterSpacing:.8,color:"#A87316",marginTop:5},
homeFooter:{fontSize:11,color:"#E1EFE8",textAlign:"center",marginTop:19,lineHeight:18,paddingHorizontal:14},homeFooterDecor:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:13,marginTop:20},homeFooterLine:{height:2,width:48,backgroundColor:"#E9BE54",borderRadius:2},homeFooterCross:{fontSize:26,color:"#F4C85D",fontWeight:"900"},button:{backgroundColor:C.blue,borderRadius:10,paddingVertical:13,paddingHorizontal:14,alignItems:"center",justifyContent:"center",flex:1,marginTop:9},buttonOutline:{backgroundColor:C.white,borderWidth:1,borderColor:C.blue},buttonText:{color:C.white,fontSize:13,fontWeight:"800"},dailyHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},sectionTitle:{fontSize:19,fontWeight:"900",color:C.ink,marginTop:21,marginBottom:12},kicker:{fontSize:10,color:C.blue,fontWeight:"900",letterSpacing:1.1},dailyCard:{backgroundColor:C.white,borderRadius:17,padding:18,borderWidth:1,borderColor:C.line,marginBottom:8},dailyRef:{fontSize:16,fontWeight:"900",color:C.blue},dailyText:{fontSize:17,lineHeight:28,color:C.ink,marginTop:9},dailyFoot:{fontSize:12,color:C.blue,fontWeight:"800",marginTop:13},resumeCard:{backgroundColor:C.white,borderRadius:16,padding:17,flexDirection:"row",alignItems:"center",borderWidth:1,borderColor:C.line},cardTitle:{fontSize:16,fontWeight:"900",color:C.ink},muted:{fontSize:12,color:C.muted,lineHeight:19,marginTop:5},cardArrow:{fontSize:26,color:C.blue,marginLeft:10},twoCards:{flexDirection:"row",gap:12},testamentCard:{flex:1,backgroundColor:C.pale,borderRadius:15,padding:16,minHeight:120,borderWidth:1,borderColor:"#BEDAF7"},cardEmoji:{fontSize:26,marginBottom:9},innerHomeBar:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:9,paddingVertical:2},innerHomeButton:{flexDirection:"row",alignItems:"center",gap:7,alignSelf:"flex-start",backgroundColor:"#E3F2E8",borderWidth:1,borderColor:"#A8CFB6",borderRadius:12,paddingHorizontal:13,paddingVertical:8},innerHomeIcon:{fontSize:21,color:"#0E7658",fontWeight:"900",lineHeight:23},innerHomeText:{fontSize:13,color:"#0D634B",fontWeight:"900"},innerPageTag:{fontSize:11,color:"#6A8577",fontWeight:"800"},readerHeader:{backgroundColor:"#E3F2E8",marginHorizontal:-17,marginTop:0,paddingHorizontal:10,paddingVertical:7,flexDirection:"row",alignItems:"center",gap:5,borderBottomWidth:1,borderColor:"#C5DFD0"},headerAction:{width:38,height:42,alignItems:"center",justifyContent:"center",borderRadius:9,backgroundColor:"#D7EDE0"},headerActionText:{fontSize:22,color:C.green,fontWeight:"800"},bookChapter:{flex:1,minWidth:0,alignItems:"center",paddingHorizontal:4,paddingVertical:10,borderWidth:1.5,borderColor:"#7DB99A",borderRadius:9,backgroundColor:"#F5FBF7"},bookChapterText:{fontSize:14,color:"#175B43",fontWeight:"800"},chapterStrip:{marginHorizontal:-17,backgroundColor:"#F0F8F3",maxHeight:64,borderBottomWidth:1,borderColor:"#D3E5D9"},chapterStripContent:{paddingHorizontal:12,alignItems:"center",gap:10},chapterPill:{width:40,height:40,borderRadius:23,borderWidth:1.3,borderColor:"#8BB99E",backgroundColor:"#F8FCF9",alignItems:"center",justifyContent:"center",marginVertical:8},chapterPillActive:{backgroundColor:C.green,borderColor:C.green},chapterPillText:{fontSize:16,color:"#244A39",fontWeight:"700"},chapterPillTextActive:{color:C.white},readerActions:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:14,paddingHorizontal:2,paddingBottom:8},readerTitle:{fontSize:19,fontWeight:"900",color:"#174B37",flexShrink:1},inlineActions:{flexDirection:"row",gap:9,alignItems:"center"},inlineActionText:{color:"#087A5C",fontSize:12,fontWeight:"900"},verseList:{backgroundColor:"#F7FBF8",paddingHorizontal:9,paddingVertical:8,marginTop:8,borderRadius:14,borderWidth:1,borderColor:"#D8E9DE"},verseRow:{flexDirection:"row",alignItems:"flex-start",paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#E5F0E8",gap:8},verseActive:{backgroundColor:"#DDF2E4",borderRadius:8,paddingHorizontal:7},verseNumber:{fontSize:16,color:"#14704F",fontWeight:"800",minWidth:20,marginTop:2},verseText:{flex:1,color:"#18382D",fontSize:18,lineHeight:28,fontFamily:"sans-serif"},copyright:{fontSize:10,color:"#657C70",lineHeight:16,paddingVertical:12},chapterFooter:{flexDirection:"row",gap:10,marginTop:10},emptyBox:{backgroundColor:"#F6FBF7",padding:20,borderRadius:14,marginTop:16,borderWidth:1,borderColor:"#CDE2D4"},emptyTitle:{fontSize:18,fontWeight:"900",color:C.ink},error:{color:C.red,backgroundColor:"#FCEBEC",padding:13,borderRadius:10,marginTop:12,lineHeight:20},pageHeading:{fontSize:27,fontWeight:"900",color:C.ink,marginTop:9,marginBottom:8},searchTopBar:{flexDirection:"row",justifyContent:"flex-start",marginBottom:8},searchHomeButton:{flexDirection:"row",alignItems:"center",alignSelf:"flex-start",gap:8,backgroundColor:"#EAF4FF",borderWidth:1,borderColor:C.blue,borderRadius:12,paddingHorizontal:16,paddingVertical:10},searchHomeIcon:{fontSize:22,color:C.blue,fontWeight:"900",lineHeight:24},searchHomeText:{fontSize:14,color:C.blue,fontWeight:"900"},searchLoading:{backgroundColor:C.white,borderRadius:14,padding:18,alignItems:"center",gap:10,marginTop:14},searchResultCount:{fontSize:13,color:C.blue,fontWeight:"800",marginTop:18,marginBottom:4},searchOpenHint:{fontSize:11,color:C.blue,fontWeight:"800",marginTop:9},searchInput:{backgroundColor:"#F8FCF9",borderWidth:1,borderColor:"#BDD9C8",borderRadius:12,padding:14,color:C.ink,fontSize:15,marginTop:17,marginBottom:8},resultCard:{backgroundColor:"#F8FCF9",borderWidth:1,borderColor:"#C7E0D0",borderRadius:13,padding:15,marginTop:12},resultText:{fontSize:15,color:C.ink,lineHeight:24,marginTop:8},savedRow:{backgroundColor:"#F7FBF8",borderRadius:13,padding:15,marginBottom:9,borderWidth:1,borderColor:"#C9E1D1"},settingsTopBar:{flexDirection:"row",justifyContent:"flex-start",marginBottom:8},settingsHomeButton:{flexDirection:"row",alignItems:"center",alignSelf:"flex-start",gap:8,backgroundColor:"#EAF4FF",borderWidth:1,borderColor:C.blue,borderRadius:12,paddingHorizontal:16,paddingVertical:10},settingsHomeIcon:{fontSize:22,color:C.blue,fontWeight:"900",lineHeight:24},settingsHomeText:{fontSize:14,color:C.blue,fontWeight:"900"},settingsCard:{backgroundColor:"#F8FCF9",borderRadius:16,padding:16,borderWidth:1,borderColor:"#C9E1D1",marginTop:16},translationName:{fontSize:19,fontWeight:"900",color:C.ink,marginTop:8},translationId:{fontSize:11,color:C.muted,marginTop:4},translationOption:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10,backgroundColor:"#EDF7F0",padding:12,borderRadius:11,marginTop:8,borderWidth:1,borderColor:"#C6DFCE"},translationOptionActive:{borderColor:C.green,borderWidth:2,backgroundColor:"#E0F2E6"},translationOptionTitle:{fontSize:14,fontWeight:"800",color:C.ink},translationCheck:{fontSize:11,fontWeight:"800",color:C.blue},audioAvailabilityMessage:{fontSize:12,lineHeight:19,padding:12,borderRadius:10,marginTop:10},audioAvailable:{color:"#166534",backgroundColor:"#DCFCE7"},audioUnavailable:{color:"#991B1B",backgroundColor:"#FEE2E2"},audioCheckNeutral:{color:C.ink,backgroundColor:"#EEF3F8"},versionRow:{backgroundColor:"#F4F8FC",padding:13,borderRadius:11,marginTop:9,borderWidth:1,borderColor:C.line},versionSelected:{borderColor:C.blue,borderWidth:2},linkText:{fontSize:11,color:C.blue,marginTop:8},noteCard:{backgroundColor:C.white,borderRadius:14,padding:14,marginTop:12},noteInput:{minHeight:90,color:C.ink,textAlignVertical:"top",padding:10},modalShade:{flex:1,backgroundColor:"rgba(0,0,0,.48)",flexDirection:"row"},scrim:{flex:1},drawer:{width:"84%",maxWidth:390,backgroundColor:C.white},drawerHead:{height:58,backgroundColor:"#0D6B50",paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},drawerTitle:{color:C.white,fontSize:19,fontWeight:"900"},closeText:{fontSize:25,color:C.blue,fontWeight:"700"},drawerSearch:{margin:12,padding:12,borderRadius:8,borderWidth:1,borderColor:C.line,color:C.ink},drawerItem:{paddingHorizontal:17,paddingVertical:15,borderBottomWidth:1,borderBottomColor:"#E3E7EC",flexDirection:"row",justifyContent:"space-between",alignItems:"center"},drawerItemActive:{backgroundColor:"#E2F2E7"},drawerItemText:{fontSize:16,color:C.ink},drawerCount:{fontSize:11,color:C.muted},pickerPanel:{backgroundColor:C.white,width:"100%",maxHeight:"88%",marginTop:"auto",borderTopLeftRadius:18,borderTopRightRadius:18,overflow:"hidden"},pickerHead:{height:58,backgroundColor:"#E4F2E8",paddingHorizontal:15,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},pickerTitle:{fontSize:19,color:C.blue,fontWeight:"800"},cancelText:{fontSize:15,color:C.blue,fontWeight:"700"},pickerTabs:{height:48,backgroundColor:"#0D7255",flexDirection:"row"},pickerTab:{flex:1,alignItems:"center",justifyContent:"center",borderBottomWidth:3,borderBottomColor:"transparent"},pickerTabActive:{borderBottomColor:"#F2CC70"},pickerTabText:{fontSize:13,color:"#FFFFFF",fontWeight:"800"},pickerBookList:{paddingBottom:20},pickerBookItem:{paddingHorizontal:18,paddingVertical:14,borderBottomWidth:1,borderBottomColor:"#D5D5D5",flexDirection:"row",justifyContent:"space-between"},pickerBookText:{fontSize:17,color:C.ink},pickerGrid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-around",padding:10},pickerNumber:{width:"18%",height:64,alignItems:"center",justifyContent:"center",marginVertical:4,borderRadius:32},pickerNumberActive:{backgroundColor:"#0E7658"},pickerNumberText:{fontSize:19,color:C.ink},
planPage:{marginHorizontal:-17,marginTop:-17,paddingHorizontal:13,paddingTop:0,paddingBottom:0,backgroundColor:"#DDF4E7",overflow:"hidden"},
planHeroImage:{width:"100%",aspectRatio:2.9,alignSelf:"stretch",backgroundColor:"#00352E",marginBottom:12,overflow:"hidden"},
planHeroImageStyle:{width:"100%",height:"100%",resizeMode:"stretch"},
planHeroHomeHitbox:{position:"absolute",left:"3.3%",top:"7.5%",width:"22%",height:"18%",backgroundColor:"transparent"},
planWelcomeCard:{backgroundColor:"#EAF8F0",borderRadius:18,padding:17,borderWidth:1,borderColor:"#BDE2CE",marginTop:7},
planWelcomeTitle:{fontSize:18,fontWeight:"900",color:"#0C573F"},
planWelcomeText:{fontSize:12,color:"#55776A",lineHeight:19,marginTop:6},
planSectionHeading:{fontSize:18,fontWeight:"900",color:"#07563F",marginTop:20,marginBottom:8},
planTemplateCard:{flexDirection:"row",alignItems:"center",gap:11,backgroundColor:"#F8FCF9",borderWidth:1,borderColor:"#CFE2D5",borderRadius:15,padding:13,marginTop:10},
planTemplateActive:{borderColor:"#0E7658",borderWidth:2,backgroundColor:"#E6F4EA"},
planTemplateIcon:{width:42,height:42,borderRadius:14,backgroundColor:"#D9EEE0",alignItems:"center",justifyContent:"center"},
planTemplateIconText:{fontSize:21},
planTemplateTitle:{fontSize:14,fontWeight:"900",color:"#174B37"},
planTemplateSubtitle:{fontSize:10,color:"#0E7658",fontWeight:"800",marginTop:3},
planTemplateDescription:{fontSize:11,color:"#60766B",lineHeight:16,marginTop:5},
planRadio:{fontSize:20,color:"#0E7658",paddingHorizontal:2},
planDetailsCard:{backgroundColor:"#FFFFFF",borderRadius:16,padding:16,borderWidth:1,borderColor:"#C9E1D1",marginTop:16},
planDetailsEyebrow:{fontSize:9,color:"#0E7658",letterSpacing:1.2,fontWeight:"900"},
planDetailsTitle:{fontSize:19,fontWeight:"900",color:"#174B37",marginTop:5},
planSummaryCard:{backgroundColor:"#003C32",borderRadius:24,padding:14,marginTop:1,marginBottom:13,borderWidth:1.3,borderColor:"#C4A84E",shadowColor:"#F3CF69",shadowOpacity:.18,shadowRadius:10,shadowOffset:{width:0,height:3},elevation:4},
planSummaryTop:{flexDirection:"row",alignItems:"center",gap:9},
planCoverImage:{width:65,height:70,borderRadius:14,borderWidth:1.2,borderColor:"#D4B65C"},
planSummaryCopy:{flex:1,minWidth:0,justifyContent:"center"},
planActivePill:{alignSelf:"flex-start",backgroundColor:"#F4D16F",borderRadius:15,paddingHorizontal:9,paddingVertical:4,marginBottom:5},
planActivePillText:{fontSize:9,color:"#4A3510",fontWeight:"900"},
planSummaryTitle:{fontSize:17,color:"#FFFFFF",fontWeight:"900",lineHeight:23},
planMetaLine:{flexDirection:"row",alignItems:"center",gap:5,marginTop:4},
planMetaIcon:{fontSize:13,color:"#F4D16F",fontWeight:"900"},
planSummaryMeta:{fontSize:9.5,color:"#E0F2E9",fontWeight:"700"},
planRingWrap:{width:68,height:68,alignItems:"center",justifyContent:"center"},
planRingLabel:{position:"absolute",fontSize:15,color:"#FFFFFF",fontWeight:"900"},
planProgressTrack:{height:9,backgroundColor:"#1D6654",borderRadius:10,overflow:"hidden",marginTop:11},
planProgressFill:{height:9,backgroundColor:"#47D4A3",borderRadius:10},
planProgressNumbers:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:7},
planProgressText:{fontSize:10.5,color:"#FFFFFF",fontWeight:"800"},
planProgressPercent:{fontSize:12,color:"#F4D36F",fontWeight:"900"},
planFinishedText:{fontSize:12,color:"#E3F6B9",fontWeight:"800",marginTop:10,lineHeight:18},
planDayNavigator:{minHeight:70,flexDirection:"row",alignItems:"center",justifyContent:"space-between",backgroundColor:"#E8F8EF",borderRadius:24,paddingHorizontal:9,paddingVertical:7,marginBottom:12,borderWidth:1,borderColor:"#BCE2CE"},
planDayArrow:{minWidth:68,paddingVertical:8,paddingHorizontal:8,backgroundColor:"#CDEEDD",borderRadius:22,alignItems:"center",justifyContent:"center"},
planDayArrowDisabled:{opacity:.38},
planDayArrowText:{fontSize:10.5,color:"#23866A",fontWeight:"900"},
planDayArrowNext:{backgroundColor:"#00664C",borderWidth:1,borderColor:"#C9E9D6",minWidth:70},
planDayArrowNextText:{fontSize:10.5,color:"#FFFFFF",fontWeight:"900"},
planDayCenter:{alignItems:"center",flex:1,paddingHorizontal:3},
planDayCalendar:{fontSize:16,color:"#087A5C",fontWeight:"900"},
planDayNumber:{fontSize:18,color:"#075A43",fontWeight:"900",marginTop:1},
planDayHint:{fontSize:9.5,color:"#527567",marginTop:1},
planDayCard:{backgroundColor:"#F3FCF7",borderRadius:22,padding:12,borderWidth:1.2,borderColor:"#C4E5D3",marginBottom:12,shadowColor:"#063D31",shadowOpacity:.07,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:2},
planDayCardHead:{flexDirection:"row",alignItems:"center",gap:8,marginBottom:9},
planBookBadge:{width:39,height:39,borderRadius:21,backgroundColor:"#087A56",alignItems:"center",justifyContent:"center"},
planBookBadgeText:{fontSize:21,color:"#FFFFFF",fontWeight:"900"},
planDayHeadCopy:{flex:1,minWidth:0},
planDayCardTitle:{fontSize:15,color:"#07563F",fontWeight:"900"},
planDayCardSubtitle:{fontSize:9.5,color:"#536F62",lineHeight:14,marginTop:2},
planDayStatus:{backgroundColor:"#FFE8A9",paddingHorizontal:8,paddingVertical:6,borderRadius:19},
planDayStatusDone:{backgroundColor:"#D1F2DF"},
planDayStatusText:{fontSize:9.5,color:"#7A5310",fontWeight:"900"},
planDayStatusTextDone:{color:"#17613F"},
planChapterRow:{minHeight:58,flexDirection:"row",alignItems:"center",gap:7,paddingHorizontal:6,paddingVertical:7,backgroundColor:"#E6F5EB",borderRadius:14,borderBottomWidth:1,borderBottomColor:"#C8E7D4",marginTop:5},
planChapterRowDone:{backgroundColor:"#D4F0DF",borderColor:"#8AC8A5"},
planChapterIconTile:{width:34,height:34,borderRadius:11,backgroundColor:"#CDECDD",alignItems:"center",justifyContent:"center"},
planChapterIcon:{fontSize:19,color:"#087A56",fontWeight:"900"},
planChapterCopy:{flex:1,minWidth:0},
planChapterTitle:{fontSize:13,color:"#073F32",fontWeight:"900"},
planChapterTitleDone:{textDecorationLine:"line-through",color:"#54766A"},
planChapterSubtitle:{fontSize:9,color:"#4F6E60",marginTop:2},
planChapterChevron:{fontSize:23,color:"#087A56",fontWeight:"900",paddingHorizontal:1},
planChapterCheck:{width:34,height:34,borderRadius:18,borderWidth:1.6,borderColor:"#0D835C",alignItems:"center",justifyContent:"center",backgroundColor:"#F9FFFB"},
planChapterCheckDone:{backgroundColor:"#0D835C",borderColor:"#0D835C"},
planChapterCheckText:{fontSize:19,color:"#0D835C",fontWeight:"900",lineHeight:22},
planChapterCheckTextDone:{color:"#FFFFFF"},
planCompleteButton:{minHeight:49,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:9,backgroundColor:"#006448",borderRadius:14,borderWidth:1.4,borderColor:"#EEC85F",paddingHorizontal:8,paddingVertical:9,marginTop:12,shadowColor:"#EBC65C",shadowOpacity:.18,shadowRadius:7,shadowOffset:{width:0,height:2},elevation:3},
planCompleteButtonDone:{backgroundColor:"#287C59",opacity:.8},
planCompleteIcon:{width:23,height:23,borderRadius:13,backgroundColor:"#F2CF68",color:"#174B37",textAlign:"center",textAlignVertical:"center",fontSize:15,fontWeight:"900",overflow:"hidden"},
planCompleteButtonText:{fontSize:12,color:"#FFFFFF",fontWeight:"900",textAlign:"center",flexShrink:1},
planActionRow:{flexDirection:"row",gap:8,alignItems:"stretch",marginBottom:8},
planBottomAction:{flex:1,minHeight:51,flexDirection:"row",alignItems:"center",justifyContent:"center",gap:6,paddingHorizontal:6,paddingVertical:8,backgroundColor:"#EAF8F0",borderWidth:1.3,borderColor:"#14825F",borderRadius:17},
planBottomActionIcon:{fontSize:17,color:"#087A56",fontWeight:"900"},
planBottomActionText:{fontSize:10.5,color:"#075A43",fontWeight:"900",textAlign:"center",flexShrink:1},
planFeedback:{fontSize:12,color:"#155B40",backgroundColor:"#E1F2E5",borderWidth:1,borderColor:"#BBDCC5",borderRadius:11,padding:12,marginTop:8,lineHeight:18},
planManageRow:{alignItems:"center",paddingVertical:7},
planManageLink:{fontSize:10,color:"#A17718",fontWeight:"800",textDecorationLine:"underline"},
planStopLink:{fontSize:10,color:"#B64436",fontWeight:"900",textDecorationLine:"underline"},
planConfirmText:{fontSize:10.5,color:"#6F3B2C",textAlign:"center",lineHeight:17},
planConfirmActions:{flexDirection:"row",justifyContent:"center",gap:22,marginTop:8},
planBottomWave:{marginTop:0,marginBottom:-1},

 verseSelected:{backgroundColor:"transparent",borderRadius:0,borderLeftWidth:0},
 verseSelectedText:{color:"#F07B21",textDecorationLine:"underline"},
 verseActionOverlay:{position:"absolute",right:5,top:"30%",alignItems:"flex-end",zIndex:100,elevation:30,width:"auto",maxWidth:"72%"},
 verseActionClose:{width:25,height:25,borderRadius:13,backgroundColor:"rgba(255,255,255,0.96)",borderWidth:1,borderColor:"#D5DEE8",alignItems:"center",justifyContent:"center",marginBottom:3,marginRight:7,shadowColor:"#0F172A",shadowOpacity:.18,shadowRadius:4,shadowOffset:{width:0,height:1},elevation:3},
 verseActionCloseText:{fontSize:19,color:"#334155",fontWeight:"700",lineHeight:21},
 verseActionRow:{flexDirection:"row",alignItems:"center",justifyContent:"flex-end",height:42,marginBottom:5},
 verseActionLabel:{minHeight:30,maxWidth:170,paddingHorizontal:8,paddingVertical:5,borderRadius:8,justifyContent:"center",alignItems:"center",marginRight:6,shadowColor:"#0F172A",shadowOpacity:.18,shadowRadius:4,shadowOffset:{width:0,height:1},elevation:3},
 verseActionLabelText:{fontSize:11.5,lineHeight:16,color:"#FFFFFF",fontWeight:"800",textAlign:"center"},
 verseActionIcon:{width:42,height:42,borderRadius:22,alignItems:"center",justifyContent:"center",borderWidth:1.5,borderColor:"rgba(255,255,255,0.92)",shadowColor:"#0F172A",shadowOpacity:.22,shadowRadius:5,shadowOffset:{width:0,height:2},elevation:5},
 verseActionIconText:{fontSize:21,color:"#FFFFFF",fontWeight:"900",textAlign:"center"},
 imageShareBackdrop:{flex:1,backgroundColor:"rgba(9,20,32,0.55)",justifyContent:"center",alignItems:"center",padding:18},
 imageSharePanel:{width:"100%",maxWidth:420,alignSelf:"center",backgroundColor:"#FFFFFF",borderRadius:20,padding:18},
 shareVerseCard:{backgroundColor:"#F3F8F4",borderRadius:16,borderWidth:1,borderColor:"#C9DED0",padding:24,minHeight:210,justifyContent:"center"},
 shareVerseBrand:{fontSize:11,fontWeight:"900",letterSpacing:1.5,color:"#087A5C",textAlign:"center",marginBottom:22},
 shareVerseText:{fontSize:22,lineHeight:34,fontWeight:"700",color:"#17382B",textAlign:"center"},
 shareVerseReference:{fontSize:15,fontWeight:"900",color:"#087A5C",textAlign:"center",marginTop:18},
 shareVerseFooter:{fontSize:10,color:"#718477",textAlign:"center",marginTop:22},
 imageShareButton:{backgroundColor:"#087A5C",borderRadius:12,padding:14,alignItems:"center",marginTop:14},
 imageShareButtonText:{color:"#FFFFFF",fontWeight:"900",fontSize:14},
 noteEditor:{width:"100%",maxWidth:480,alignSelf:"center",backgroundColor:"#FFFFFF",borderRadius:20,padding:18,paddingBottom:22},
 noteEditorInput:{minHeight:130,maxHeight:240,borderWidth:1,borderColor:"#CBD5E1",borderRadius:12,padding:12,color:"#172B3A",textAlignVertical:"top",fontSize:15,marginTop:10},
 noteEditorButtons:{flexDirection:"row",justifyContent:"flex-end",gap:10,marginTop:14},
 noteCancelButton:{paddingHorizontal:17,paddingVertical:12,borderRadius:10,backgroundColor:"#EEF2F6"},
 noteCancelText:{color:"#334155",fontWeight:"800"},
 noteSaveButton:{paddingHorizontal:18,paddingVertical:12,borderRadius:10,backgroundColor:"#087A5C"},
 noteSaveText:{color:"#FFFFFF",fontWeight:"900"},

  notesHeroCard:{backgroundColor:"#06483B",borderRadius:19,padding:16,marginTop:16,borderWidth:1,borderColor:"#D4B85D"},
  notesHeroTop:{flexDirection:"row",alignItems:"center"},
  notesHeroEyebrow:{fontSize:9,color:"#A9E2C8",fontWeight:"900",letterSpacing:1.2},
  notesHeroTitle:{fontSize:21,color:"#FFFFFF",fontWeight:"900",marginTop:5},
  notesHeroCaption:{fontSize:11,color:"#D6EDE1",marginTop:4},
  notesHeroIcon:{width:52,height:52,borderRadius:16,backgroundColor:"#234B36",borderWidth:1,borderColor:"#E4BD56",alignItems:"center",justifyContent:"center"},
  notesHeroActions:{flexDirection:"row",gap:9,marginTop:15},
  notesPrimaryButton:{flex:1,minHeight:42,backgroundColor:"#EFCB67",borderRadius:11,alignItems:"center",justifyContent:"center"},
  notesPrimaryButtonText:{fontSize:12,color:"#264535",fontWeight:"900"},
  notesSecondaryButton:{flex:1,minHeight:42,backgroundColor:"#0A6650",borderWidth:1,borderColor:"#8CCEB3",borderRadius:11,alignItems:"center",justifyContent:"center"},
  notesSecondaryButtonText:{fontSize:12,color:"#FFFFFF",fontWeight:"900"},
  notesSearch:{backgroundColor:"#FFFFFF",borderWidth:1,borderColor:"#BDD9C8",borderRadius:13,paddingHorizontal:14,paddingVertical:12,color:C.ink,fontSize:14,marginTop:16},
  notesFilters:{gap:8,paddingVertical:12,paddingRight:10},
  notesFilterChip:{paddingHorizontal:12,paddingVertical:8,borderRadius:20,backgroundColor:"#E5F1E9",borderWidth:1,borderColor:"#C9DFD0"},
  notesFilterChipActive:{backgroundColor:"#087A5C",borderColor:"#087A5C"},
  notesFilterText:{fontSize:10,color:"#476758",fontWeight:"800"},
  notesFilterTextActive:{color:"#FFFFFF"},
  notesListHeading:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  notesResultCount:{fontSize:11,color:"#638074",fontWeight:"800"},
  notesEmpty:{alignItems:"center",backgroundColor:"#F8FCF9",borderWidth:1,borderColor:"#C9E1D1",borderRadius:17,padding:22,marginTop:10},
  notesEmptyIcon:{width:56,height:56,borderRadius:18,backgroundColor:"#E0F1E6",alignItems:"center",justifyContent:"center",marginBottom:10},
  notesEmptyTitle:{fontSize:17,color:"#164D38",fontWeight:"900"},
  notesEmptyText:{fontSize:12,color:"#637B6E",lineHeight:19,textAlign:"center",marginTop:6},
  noteLibraryCard:{backgroundColor:"#FAFDFA",borderWidth:1,borderColor:"#C9E1D1",borderRadius:16,padding:14,marginTop:11},
  noteLibraryCardTop:{flexDirection:"row",alignItems:"flex-start",gap:8},
  noteLibraryTitle:{fontSize:15,color:"#174B37",fontWeight:"900",flexShrink:1},
  noteLibraryMeta:{fontSize:10,color:"#71877B",marginTop:5},
  noteKindBadge:{paddingHorizontal:8,paddingVertical:5,borderRadius:12,alignSelf:"flex-start"},
  noteKindPersonal:{backgroundColor:"#E3F1FF"},
  noteKindVerse:{backgroundColor:"#FFF1D0"},
  noteKindStudy:{backgroundColor:"#F0E8FB"},
  noteKindBadgeText:{fontSize:9,color:"#34594A",fontWeight:"900"},
  noteLibraryContent:{fontSize:13,color:"#29483B",lineHeight:21,marginTop:10},
  noteReferenceChip:{alignSelf:"flex-start",backgroundColor:"#E5F3E9",borderWidth:1,borderColor:"#C5E2CF",borderRadius:10,paddingHorizontal:10,paddingVertical:7,marginTop:10},
  noteReferenceText:{fontSize:10,color:"#0B7655",fontWeight:"900"},
  noteTagList:{flexDirection:"row",flexWrap:"wrap",gap:6,marginTop:9},
  noteTag:{backgroundColor:"#F0F5F1",borderRadius:10,paddingHorizontal:8,paddingVertical:4},
  noteTagText:{fontSize:9,color:"#62796B",fontWeight:"800"},
  noteCardActions:{flexDirection:"row",gap:8,borderTopWidth:1,borderTopColor:"#E1ECE4",paddingTop:10,marginTop:12},
  noteCardAction:{flex:1,alignItems:"center",paddingVertical:7,backgroundColor:"#E9F4EC",borderRadius:9},
  noteCardActionText:{fontSize:11,color:"#0D6D50",fontWeight:"900"},
  noteCardDelete:{flex:1,alignItems:"center",paddingVertical:7,backgroundColor:"#FCEDEC",borderRadius:9},
  noteCardDeleteText:{fontSize:11,color:"#A23C3C",fontWeight:"900"},
  noteDeleteConfirm:{backgroundColor:"#FFF6E7",borderWidth:1,borderColor:"#E9CE96",borderRadius:10,padding:11,marginTop:10},
  noteDeleteConfirmText:{fontSize:11,color:"#64491C",fontWeight:"800"},
  noteDeleteButtons:{flexDirection:"row",justifyContent:"flex-end",gap:18,marginTop:10},
  noteDeleteCancel:{fontSize:11,color:"#456B58",fontWeight:"900"},
  noteDeleteYes:{fontSize:11,color:"#B23D36",fontWeight:"900"},
  notesFooter:{backgroundColor:"#E7F2EA",borderRadius:11,padding:11,marginTop:15},
  notesFooterText:{fontSize:10,color:"#5E786A",lineHeight:16},
  noteEditorScroll:{width:"100%",maxHeight:"92%"},
  noteEditorScrollContent:{flexGrow:1,justifyContent:"center",padding:12},
  noteFieldLabel:{fontSize:12,color:"#315C48",fontWeight:"900",marginTop:13,marginBottom:6},
  noteKindChoices:{flexDirection:"row",flexWrap:"wrap",gap:7},
  noteKindChoice:{paddingHorizontal:10,paddingVertical:8,borderRadius:10,borderWidth:1,borderColor:"#C7DCD0",backgroundColor:"#F4F8F5"},
  noteKindChoiceActive:{backgroundColor:"#087A5C",borderColor:"#087A5C"},
  noteKindChoiceText:{fontSize:10,color:"#446757",fontWeight:"800"},
  noteKindChoiceTextActive:{color:"#FFFFFF"},
  noteTitleInput:{minHeight:43,borderWidth:1,borderColor:"#CBDDD1",borderRadius:11,paddingHorizontal:11,paddingVertical:9,color:"#172B3A",fontSize:14,backgroundColor:"#FBFDFC"},
  noteReferenceEditorRow:{flexDirection:"row",alignItems:"center",gap:8,marginTop:6},
  noteReferenceEditorValue:{fontSize:11,color:"#6B8075",marginTop:1},
  noteReferenceAddButton:{backgroundColor:"#E0F1E6",borderWidth:1,borderColor:"#9FCDB0",borderRadius:9,paddingHorizontal:10,paddingVertical:8},
  noteReferenceAddText:{fontSize:10,color:"#0B7655",fontWeight:"900"},
  noteReferenceRemove:{alignSelf:"flex-start",paddingVertical:6},
  noteReferenceRemoveText:{fontSize:10,color:"#A14A43",fontWeight:"800"},


  actionScrim:{flex:1,backgroundColor:"rgba(9,20,32,0.55)",justifyContent:"flex-end",padding:14},
  actionSheetHeader:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginBottom:12},
  actionSheetTitle:{fontSize:18,color:"#17382B",fontWeight:"900"},
  actionSheetSubtitle:{fontSize:11,color:"#688075",marginTop:3},


  verseNoteIndicator:{fontSize:14,color:"#D08B20",fontWeight:"900",marginLeft:3,marginTop:3},
  notesUtilityActions:{flexDirection:"row",gap:8,marginTop:9},
  notesUtilityButton:{flex:1,alignItems:"center",paddingVertical:8,borderRadius:9,borderWidth:1,borderColor:"#8BC7AD",backgroundColor:"#0B5947"},
  notesUtilityText:{fontSize:10,color:"#E5F3E9",fontWeight:"800"},
  noteBackupHint:{fontSize:11,color:"#647B6E",lineHeight:17,marginTop:8},
  noteBackupInput:{minHeight:180,maxHeight:320,borderWidth:1,borderColor:"#CBDDD1",borderRadius:11,padding:11,color:"#172B3A",fontSize:11,textAlignVertical:"top",backgroundColor:"#FBFDFC",marginTop:12},


  notesPageV2:{marginHorizontal:-17,marginTop:-17,paddingBottom:22,backgroundColor:"#DDF3E7",overflow:"hidden"},
  notesHeroV2:{width:"100%",height:194,paddingHorizontal:13,paddingTop:13,paddingBottom:14,justifyContent:"space-between",backgroundColor:"#003F35"},
  notesHeroOverlayV2:{...StyleSheet.absoluteFillObject,backgroundColor:"rgba(0,37,30,0.12)"},
  notesHeroNavV2:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},
  notesHomePillV2:{flexDirection:"row",alignItems:"center",gap:6,paddingHorizontal:11,paddingVertical:7,borderRadius:20,backgroundColor:"rgba(0,72,54,0.82)",borderWidth:1,borderColor:"#E9C65E"},
  notesHomeIconV2:{fontSize:17,color:"#FFE8A0",fontWeight:"900"},
  notesHomeTextV2:{fontSize:11,color:"#FFFFFF",fontWeight:"900"},
  notesHeroTagV2:{fontSize:9,color:"#FFFFFF",fontWeight:"900",letterSpacing:.6,textShadowColor:"#00352B",textShadowRadius:4},
  notesHeroCopyV2:{maxWidth:"82%"},
  notesHeroTitleRowV2:{flexDirection:"row",alignItems:"center",gap:9},
  notesHeroTitleIconV2:{width:39,height:39,alignItems:"center",justifyContent:"center"},
  notesHeroTitleV2:{fontSize:29,color:"#FFFFFF",fontWeight:"900",lineHeight:36,textShadowColor:"rgba(0,0,0,0.35)",textShadowRadius:5},
  notesHeroGoldV2:{color:"#F5CB59"},
  notesHeroSubtitleV2:{fontSize:11,color:"#F2F8F3",lineHeight:17,marginTop:5,textShadowColor:"rgba(0,0,0,0.55)",textShadowRadius:3},
  notesHeroUnderlineV2:{width:42,height:3,borderRadius:3,backgroundColor:"#F1CA58",marginTop:8},
  notesBodyV2:{paddingHorizontal:12,paddingTop:0,paddingBottom:7,backgroundColor:"#DDF3E7"},
  notesSummaryV2:{backgroundColor:"#003F33",borderRadius:18,padding:12,marginTop:-1,borderWidth:1.1,borderColor:"#C6A84C",shadowColor:"#003D32",shadowOpacity:.19,shadowRadius:8,shadowOffset:{width:0,height:3},elevation:4},
  notesSummaryTopV2:{flexDirection:"row",alignItems:"center",gap:9},
  notesSummaryIconV2:{width:51,height:51,borderRadius:26,backgroundColor:"#075B48",borderWidth:1,borderColor:"#1BA77A",alignItems:"center",justifyContent:"center"},
  notesSummaryCopyV2:{flex:1,minWidth:0},
  notesSummaryEyebrowV2:{alignSelf:"flex-start",backgroundColor:"#F4D16A",color:"#4D3B13",fontSize:9,fontWeight:"900",paddingHorizontal:9,paddingVertical:4,borderRadius:12,overflow:"hidden"},
  notesSummaryTitleV2:{fontSize:17,color:"#FFFFFF",fontWeight:"900",marginTop:4,lineHeight:22},
  notesSummaryCaptionV2:{fontSize:9,color:"#C8E8D9",marginTop:2},
  notesMiniChartV2:{height:42,flexDirection:"row",alignItems:"flex-end",gap:3,paddingHorizontal:3,paddingBottom:2},
  notesMiniBarV2:{width:5,borderRadius:3},
  notesHeroActionsV2:{flexDirection:"row",gap:8,marginTop:11},
  notesPrimaryButtonV2:{flex:1,minHeight:39,alignItems:"center",justifyContent:"center",backgroundColor:"#F2CC62",borderRadius:20,borderWidth:1,borderColor:"#FFE6A0",shadowColor:"#F5CD63",shadowOpacity:.2,shadowRadius:4,elevation:2},
  notesPrimaryButtonTextV2:{fontSize:12,color:"#173C2D",fontWeight:"900"},
  notesSecondaryButtonV2:{flex:1,minHeight:39,alignItems:"center",justifyContent:"center",backgroundColor:"#075E4A",borderRadius:20,borderWidth:1,borderColor:"#74C9A5"},
  notesSecondaryButtonTextV2:{fontSize:11.5,color:"#FFFFFF",fontWeight:"900"},
  notesSearchV2:{minHeight:43,flexDirection:"row",alignItems:"center",gap:7,backgroundColor:"#F9FFFB",borderWidth:1,borderColor:"#B8DCC8",borderRadius:15,paddingLeft:12,paddingRight:6,marginTop:12,shadowColor:"#1F6B4E",shadowOpacity:.08,shadowRadius:4,shadowOffset:{width:0,height:2},elevation:2},
  notesSearchIconV2:{fontSize:23,color:"#087A5C",fontWeight:"800",lineHeight:26},
  notesSearchInputV2:{flex:1,minWidth:0,paddingVertical:8,paddingHorizontal:2,fontSize:12,color:"#173D30"},
  notesFilterButtonV2:{width:34,height:34,borderRadius:18,backgroundColor:"#DDF3E7",alignItems:"center",justifyContent:"center",borderWidth:1,borderColor:"#BFE2CF"},
  notesFilterIconV2:{fontSize:20,color:"#087A5C",fontWeight:"900"},
  notesSortMenuV2:{backgroundColor:"#F8FFFA",borderWidth:1,borderColor:"#C4E1CF",borderRadius:13,padding:9,marginTop:7,shadowColor:"#173E2D",shadowOpacity:.08,shadowRadius:5,elevation:2},
  notesSortTitleV2:{fontSize:11,color:"#315D48",fontWeight:"900",marginBottom:5},
  notesSortOptionV2:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingHorizontal:10,paddingVertical:8,borderRadius:8},
  notesSortOptionActiveV2:{backgroundColor:"#E0F3E7"},
  notesSortOptionTextV2:{fontSize:11,color:"#456B58",fontWeight:"700"},
  notesSortOptionTextActiveV2:{color:"#087A5C",fontWeight:"900"},
  notesSortTickV2:{fontSize:13,color:"#087A5C",fontWeight:"900"},
  notesCategoryGridV2:{flexDirection:"row",gap:6,marginTop:11},
  notesCategoryCardV2:{flex:1,minWidth:0,minHeight:74,alignItems:"center",justifyContent:"center",paddingHorizontal:3,paddingVertical:8,borderRadius:14,backgroundColor:"#EAF8EF",borderWidth:1,borderColor:"#C8E4D2",shadowColor:"#1F6B4E",shadowOpacity:.08,shadowRadius:4,shadowOffset:{width:0,height:2},elevation:1},
  notesCategoryCardActiveV2:{backgroundColor:"#00815F",borderColor:"#E4C45C",shadowColor:"#087A5C",shadowOpacity:.22,elevation:3},
  notesCategoryLabelV2:{fontSize:9.5,color:"#255542",fontWeight:"900",textAlign:"center",marginTop:4,lineHeight:12},
  notesCategoryLabelActiveV2:{color:"#FFFFFF"},
  notesCategoryCountV2:{fontSize:9,color:"#5D7D6D",fontWeight:"800",marginTop:2},
  notesCategoryCountActiveV2:{color:"#E5F5EB"},
  notesCategoryActiveMarkV2:{position:"absolute",bottom:-1,width:17,height:3,borderRadius:3,backgroundColor:"#F4D16A"},
  notesListHeadingV2:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:18,marginBottom:8},
  notesListTitleRowV2:{flexDirection:"row",alignItems:"center",gap:7},
  notesListBookmarkV2:{fontSize:20,color:"#0A7858",fontWeight:"900"},
  notesListTitleV2:{fontSize:17,color:"#174C39",fontWeight:"900"},
  notesResultCountV2:{fontSize:10,color:"#5D7D6D",fontWeight:"900"},
  notesEmptyV2:{alignItems:"center",justifyContent:"center",backgroundColor:"#F7FCF8",borderWidth:1,borderColor:"#C5E3D0",borderRadius:18,paddingHorizontal:18,paddingVertical:20,marginTop:4,marginBottom:5},
  notesEmptyIconV2:{width:48,height:48,borderRadius:15,backgroundColor:"#E1F4E8",alignItems:"center",justifyContent:"center"},
  notesEmptyTitleV2:{fontSize:15,color:"#174C39",fontWeight:"900",marginTop:8},
  notesEmptyTextV2:{fontSize:10.5,color:"#638174",lineHeight:16,textAlign:"center",marginTop:4,maxWidth:250},
  notesEmptyButtonV2:{backgroundColor:"#087A5C",paddingHorizontal:17,paddingVertical:9,borderRadius:10,marginTop:10},
  notesEmptyButtonTextV2:{fontSize:11,color:"#FFFFFF",fontWeight:"900"},
  noteCardV2:{backgroundColor:"#F9FFFB",borderRadius:15,padding:10,marginTop:8,borderWidth:1,borderColor:"#D0E8D9",borderLeftWidth:4,shadowColor:"#1E5F45",shadowOpacity:.08,shadowRadius:4,shadowOffset:{width:0,height:2},elevation:2},
  noteCardPersonalV2:{borderLeftColor:"#C88AF4"},
  noteCardStudyV2:{borderLeftColor:"#4C9AE8"},
  noteCardVerseV2:{borderLeftColor:"#EFC84C"},
  noteCardMainV2:{flexDirection:"row",alignItems:"center",gap:8},
  noteCardIconV2:{width:39,height:39,borderRadius:13,alignItems:"center",justifyContent:"center"},
  noteCardIconPersonalV2:{backgroundColor:"#F0E5FC"},
  noteCardIconStudyV2:{backgroundColor:"#E2F0FF"},
  noteCardIconVerseV2:{backgroundColor:"#E1F5E8"},
  noteCardCopyV2:{flex:1,minWidth:0},
  noteCardTitleV2:{fontSize:12.5,color:"#153E30",fontWeight:"900"},
  noteCardExcerptV2:{fontSize:10,color:"#5D756A",lineHeight:14,marginTop:2},
  noteCardReferenceV2:{fontSize:9,color:"#087A5C",fontWeight:"900",marginTop:3},
  noteCardMoreV2:{width:28,height:34,alignItems:"center",justifyContent:"center",borderRadius:9,backgroundColor:"#EDF7F0"},
  noteCardMoreTextV2:{fontSize:14,color:"#174B39",fontWeight:"900",letterSpacing:1},
  noteCardMetaV2:{flexDirection:"row",alignItems:"center",gap:6,marginTop:8,minHeight:20},
  noteKindPillV2:{paddingHorizontal:8,paddingVertical:4,borderRadius:12},
  noteKindPersonalV2:{backgroundColor:"#F0E2FB"},
  noteKindStudyV2:{backgroundColor:"#E2EEFF"},
  noteKindVerseV2:{backgroundColor:"#DDF3E5"},
  noteKindPillTextV2:{fontSize:9,fontWeight:"900"},
  noteKindTextPersonalV2:{color:"#8753B5"},
  noteKindTextStudyV2:{color:"#235B9C"},
  noteKindTextVerseV2:{color:"#087A5C"},
  noteCardTagsV2:{flex:1,minWidth:0,fontSize:8.5,color:"#6C8377"},
  noteCardDateV2:{fontSize:8.5,color:"#6D8378",fontWeight:"700"},
  noteActionsMenuV2:{flexDirection:"row",flexWrap:"wrap",gap:7,borderTopWidth:1,borderTopColor:"#E3EFE7",paddingTop:8,marginTop:8},
  noteActionButtonV2:{backgroundColor:"#E8F5EC",borderRadius:9,paddingHorizontal:10,paddingVertical:7},
  noteActionTextV2:{fontSize:10,color:"#0D7655",fontWeight:"900"},
  noteActionDeleteV2:{backgroundColor:"#FCE9E7",borderRadius:9,paddingHorizontal:10,paddingVertical:7},
  noteActionDeleteTextV2:{fontSize:10,color:"#A83E38",fontWeight:"900"},
  noteDeleteConfirmV2:{backgroundColor:"#FFF5E3",borderWidth:1,borderColor:"#E9CB8A",borderRadius:9,padding:9,marginTop:8},
  noteDeleteConfirmTextV2:{fontSize:10,color:"#61491C",fontWeight:"800"},
  noteDeleteButtonsV2:{flexDirection:"row",justifyContent:"flex-end",gap:18,marginTop:7},
  noteDeleteCancelV2:{fontSize:10,color:"#496D59",fontWeight:"900"},
  noteDeleteYesV2:{fontSize:10,color:"#AD3F38",fontWeight:"900"},
  notesFabRowV2:{alignItems:"flex-end",marginTop:2,marginBottom:8},
  notesFabV2:{width:49,height:49,borderRadius:25,backgroundColor:"#F3C84F",borderWidth:1,borderColor:"#FFE7A1",alignItems:"center",justifyContent:"center",shadowColor:"#B78B2A",shadowOpacity:.3,shadowRadius:7,shadowOffset:{width:0,height:3},elevation:5},
  notesFabPlusV2:{fontSize:29,color:"#174B38",fontWeight:"500",lineHeight:33},
  notesBottomToolsV2:{flexDirection:"row",gap:6,marginTop:0},
  notesBottomToolV2:{flex:1,minWidth:0,minHeight:55,alignItems:"center",justifyContent:"center",paddingHorizontal:2,paddingVertical:7,borderRadius:15,backgroundColor:"#EAF9F0",borderWidth:1,borderColor:"#94CDB0",shadowColor:"#247A57",shadowOpacity:.1,shadowRadius:4,shadowOffset:{width:0,height:2},elevation:2},
  notesBottomToolIconV2:{fontSize:19,color:"#087A5C",fontWeight:"900",lineHeight:22},
  notesBottomToolTextV2:{fontSize:9.5,color:"#146548",fontWeight:"900",marginTop:2,textAlign:"center"},
  notesFooterV2:{fontSize:9,color:"#668277",lineHeight:14,textAlign:"center",marginTop:9,paddingHorizontal:9},


});
