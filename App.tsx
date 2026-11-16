import React, { useEffect, useMemo, useState } from "react";
import Svg, { Circle, Line, Path, Rect, Defs, LinearGradient, Stop } from "react-native-svg";
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable, SafeAreaView,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View, Linking, Image
} from "react-native";
import * as Speech from "expo-speech";
import { useAudioPlayer, useAudioPlayerStatus, setAudioModeAsync } from "expo-audio";
import { Directory, File, Paths } from "expo-file-system";
import { getChapterAudio, ChapterAudio } from "./src/lib/audioApi";
import { BOOKS, BibleBook } from "./src/data/books";
import { ApiBible, ApiIndexBook, getBibleIndex, getHindiBibles, getPassage, searchVerses, searchBibleText } from "./src/lib/bibleApi";
import { SavedReference, storage } from "./src/lib/storage";

type Tab = "home" | "bible" | "audio" | "search" | "saved" | "settings";
type Passage = { id:string; content:string; reference:string; copyright?:string };
type PickerTab = "BOOK" | "CHAPTER" | "VERSE";
const C = { bg:"#F4F7FB", blue:"#0879E8", blueDark:"#075CB5", pale:"#D9EBFF", ink:"#172536", muted:"#66778B", line:"#D7E1EC", white:"#FFFFFF", gold:"#D6A64D", green:"#0E6256", red:"#A33D42" };

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

  useEffect(()=>{
    (async()=>{
      const [id,bm,hist,fz]=await Promise.all([storage.getBibleId(),storage.getBookmarks(),storage.getHistory(),storage.getFontSize()]);
      setBookmarks(bm);setHistory(hist);setFontSize(18); if(fz!==18) await storage.setFontSize(18);
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

  async function openChapter(nextBook:BibleBook,nextChapter:number) {
    setBook(nextBook);setChapter(nextChapter);setTab("bible");setDrawer(false);setPicker(false);setPassage(null);setError("");
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
        audioPlayer.setActiveForLockScreen(true,{title:`${nextBook.hindi} अध्याय ${nextChapter}`,artist:"Hindi Bible",albumTitle:"Audio Bible"},{showNextTrack:true,showPreviousTrack:true,showSeekForward:true,showSeekBackward:true});
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
      audioPlayer.setActiveForLockScreen(true,{title:`${book.hindi} अध्याय ${chapter}`,artist:"Hindi Bible",albumTitle:"Audio Bible"},{showNextTrack:true,showPreviousTrack:true,showSeekForward:true,showSeekBackward:true});
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

  return <SafeAreaView style={[s.safe,tab==="home"&&s.safeHome]}>
    <StatusBar barStyle={tab==="home"?"light-content":"dark-content"} backgroundColor={tab==="home"?"#002D28":C.pale}/>
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
          <View style={s.homeHeader}>
            <Image source={require("./assets/home/header-cross.jpg")} style={s.homeHeaderPhoto} resizeMode="stretch"/>
            <Pressable onPress={()=>changeTab("settings")} style={s.homeSettingsButton} accessibilityRole="button" accessibilityLabel="सेटिंग्स खोलें">
              <Text style={s.homeSettingsIcon}>⚙</Text>
            </Pressable>
          </View>

          <Pressable style={s.homeHero} onPress={()=>openChapter(BOOKS[0],1)} accessibilityRole="button">
            <Image source={require("./assets/home/open-bible.jpg")} style={s.homeHeroPhoto} resizeMode="cover"/>
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
              {icon:"audio",label:"ऑडियो बाइबल",description:"वचन को सुनें",action:"audio",accent:"#079B70",halo:"#E0F8ED"},
              {icon:"search",label:"वचन खोजें",description:"किसी भी वचन को खोजें",action:"search",accent:"#149FBE",halo:"#E1F6FB"},
              {icon:"bookmark",label:"बुकमार्क",description:"पसंदीदा वचन सहेजें",action:"saved",accent:"#C18A17",halo:"#FFF4D8"},
              {icon:"plan",label:"पढ़ने की योजना",description:"नियमित बाइबल अध्ययन",action:"soon",accent:"#9560C9",halo:"#F2EAFE"},
              {icon:"notes",label:"नोट्स",description:"अपने विचार लिखें",action:"soon",accent:"#C07B16",halo:"#FFF0DC"},
              {icon:"study",label:"बाइबल अध्ययन",description:"गहराई से समझें",action:"soon",accent:"#158EAD",halo:"#E2F6FA"}
            ].map(item=>{
              const cardContent=<>
                <Svg width="100%" height={43} viewBox="0 0 150 43" preserveAspectRatio="none" style={s.featureWave}>
                  <Path d="M-8 37 C 18 14, 37 48, 66 28 S 116 10, 158 31" stroke={item.accent} strokeWidth="1.1" fill="none" opacity=".45"/>
                  <Path d="M-8 43 C 24 20, 45 52, 78 34 S 124 19, 158 37" stroke={item.accent} strokeWidth=".8" fill="none" opacity=".28"/>
                </Svg>
                <View style={[s.featureIconHalo,{borderColor:item.accent,backgroundColor:item.halo,shadowColor:item.accent}]}>
                  <HomeFeatureIcon name={item.icon} color={item.accent}/>
                </View>
                <Text style={s.featureLabel}>{item.label}</Text>
                <Text style={s.featureSub}>{item.description}</Text>
              </>;
              if(item.action==="audio") return <Pressable key={item.label} style={[s.featureCard,{borderColor:"#A6E5CB",backgroundColor:"#F0FBF5"}]} onPress={()=>openAudioChapter(book,chapter)} accessibilityRole="button">{cardContent}</Pressable>;
              if(item.action==="search") return <Pressable key={item.label} style={[s.featureCard,{borderColor:"#B3E6F0",backgroundColor:"#F0FAFC"}]} onPress={()=>changeTab("search")} accessibilityRole="button">{cardContent}</Pressable>;
              if(item.action==="saved") return <Pressable key={item.label} style={[s.featureCard,{borderColor:"#F0D99B",backgroundColor:"#FFFAEE"}]} onPress={()=>changeTab("saved")} accessibilityRole="button">{cardContent}</Pressable>;
              return <View key={item.label} style={[s.featureCard,{borderColor:item.accent+"66",backgroundColor:item.halo}]}>{cardContent}</View>;
            })}
          </View>
          <View style={s.homeFooterDecor}><View style={s.homeFooterLine}/><Text style={s.homeFooterCross}>✝</Text><View style={s.homeFooterLine}/></View><Text style={s.homeFooter}>परमेश्वर का वचन आपके जीवन में शांति और आशा लाए।</Text>
        </View>
      </>}

      {tab==="bible"&&<>
        <View style={s.readerHeader}>
          <Pressable onPress={()=>setDrawer(true)} style={s.headerAction}><Text style={s.headerActionText}>☰</Text></Pressable>
          <Pressable onPress={()=>openPicker("CHAPTER")} style={s.bookChapter}><Text style={s.bookChapterText}>{book.hindi} {chapter}　⌄</Text></Pressable>
          <Pressable onPress={()=>speaking?stopSpeech():speakFrom(0)} style={s.headerAction}><Text style={s.headerActionText}>{speaking?"Ⅱ":"▶"}</Text></Pressable>
          <Pressable onPress={()=>changeTab("home")} style={s.headerAction}><Text style={s.headerActionText}>⌂</Text></Pressable>
          <Pressable onPress={()=>changeTab("settings")} style={s.headerAction}><Text style={s.headerActionText}>⚙</Text></Pressable>
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.chapterStrip} contentContainerStyle={s.chapterStripContent}>
          {chapterNumbers.map(n=><Pressable key={n} onPress={()=>tab==="audio"?openAudioChapter(book,n):openChapter(book,n)} style={[s.chapterPill,n===chapter&&s.chapterPillActive]}><Text style={[s.chapterPillText,n===chapter&&s.chapterPillTextActive]}>{n}</Text></Pressable>)}
        </ScrollView>
        <View style={s.readerActions}>
          <Text style={s.readerTitle}>{book.hindi} {chapter}</Text>
          <View style={s.inlineActions}><Pressable onPress={toggleBookmark}><Text style={s.inlineActionText}>{currentSaved?"★ सेव":"☆ सेव करें"}</Text></Pressable><Pressable onPress={()=>openPicker("BOOK")}><Text style={s.inlineActionText}>पुस्तक चुनें</Text></Pressable></View>
        </View>
        {loading&&<ActivityIndicator color={C.blue} size="large" style={{margin:24}}/>}
        {!!error&&<Text style={s.error}>{error}</Text>}
        {!passage&&!loading&&!error&&<View style={s.emptyBox}><Text style={s.emptyTitle}>बाइबल पढ़ना शुरू करें</Text><Text style={s.muted}>ऊपर से पुस्तक और अध्याय चुनें।</Text><Button label="पुस्तक चुनें" onPress={()=>openPicker("BOOK")}/></View>}
        {passage&&<View style={s.verseList}>
          {verseList.map((v,i)=><Pressable key={v.number||i} onPress={()=>speaking?stopSpeech():speakFrom(i)} style={[s.verseRow,speaking&&speechVerse===i&&s.verseActive]}>
            {v.number>0&&<Text style={s.verseNumber}>{v.number}</Text>}
            <Text style={[s.verseText,{fontSize:Math.min(fontSize,19),lineHeight:Math.min(fontSize,19)*1.55}]}>{v.text}</Text>
          </Pressable>)}
          <Text style={s.copyright}>{passage.reference} • {passage.copyright||"अनुवाद का लाइसेंस और श्रेय Settings में देखें।"}</Text>
        </View>}

      </>}

      {tab==="audio"&&<>
        <View style={s.readerHeader}>
          <Pressable onPress={()=>changeTab("home")} style={s.headerAction}><Text style={s.headerActionText}>‹</Text></Pressable>
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
        <View style={s.searchTopBar}>
          <Pressable onPress={()=>changeTab("home")} style={s.searchHomeButton} accessibilityRole="button" accessibilityLabel="होम पेज पर वापस जाएँ">
            <Text style={s.searchHomeIcon}>⌂</Text><Text style={s.searchHomeText}>होम पर जाएँ</Text>
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

      {tab==="saved"&&<>
        <Text style={s.pageHeading}>सेव किए गए वचन</Text><Text style={s.sectionTitle}>बुकमार्क ({bookmarks.length})</Text>
        {bookmarks.map(x=><Pressable key={x.id} style={s.savedRow} onPress={()=>openChapter(BOOKS.find(b=>b.id===x.bookId)||BOOKS[0],x.chapter)}><Text style={s.cardTitle}>☆ {x.reference}</Text><Text style={s.muted}>अध्याय खोलें →</Text></Pressable>)}
        {!bookmarks.length&&<Text style={s.emptyBox}>अभी कोई बुकमार्क सेव नहीं है।</Text>}
        <Text style={s.sectionTitle}>हाल ही में पढ़े ({history.length})</Text>
        {history.map(x=><Pressable key={x.id} style={s.savedRow} onPress={()=>openChapter(BOOKS.find(b=>b.id===x.bookId)||BOOKS[0],x.chapter)}><Text style={s.cardTitle}>{x.reference}</Text><Text style={s.muted}>फिर से पढ़ें →</Text></Pressable>)}
      </>}

      {tab==="settings"&&<>
        <View style={s.settingsTopBar}>
          <Pressable onPress={()=>changeTab("home")} style={s.settingsHomeButton} accessibilityRole="button" accessibilityLabel="होम पेज पर वापस जाएँ">
            <Text style={s.settingsHomeIcon}>⌂</Text>
            <Text style={s.settingsHomeText}>होम पर जाएँ</Text>
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
  </SafeAreaView>;
}

const s=StyleSheet.create({
 audioPanel:{backgroundColor:C.white,borderRadius:18,padding:16,borderWidth:1,borderColor:C.line,marginTop:14},audioTitle:{fontSize:22,fontWeight:"900",color:C.ink,marginTop:8},audioLabel:{fontSize:13,fontWeight:"800",color:C.ink,marginTop:18,marginBottom:8},readerChoices:{flexDirection:"row",flexWrap:"wrap",gap:8},readerChoice:{paddingHorizontal:13,paddingVertical:9,borderRadius:20,borderWidth:1,borderColor:C.line,backgroundColor:"#F4F7FB"},readerChoiceActive:{backgroundColor:C.blue,borderColor:C.blue},readerChoiceText:{fontSize:12,color:C.ink,fontWeight:"800"},audioProgressRow:{flexDirection:"row",justifyContent:"space-between",marginTop:18},audioProgress:{height:7,backgroundColor:"#E1E8F0",borderRadius:8,overflow:"hidden",marginTop:5},audioProgressFill:{height:7,backgroundColor:C.blue,borderRadius:8},audioControls:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:18,marginBottom:10},audioControl:{minWidth:38,height:42,alignItems:"center",justifyContent:"center"},audioControlText:{fontSize:13,fontWeight:"800",color:C.ink},audioPlay:{width:58,height:58,borderRadius:29,backgroundColor:C.blue,alignItems:"center",justifyContent:"center"},audioPlayText:{fontSize:25,color:C.white,fontWeight:"900"},audioHint:{fontSize:11,color:C.muted,lineHeight:18,marginTop:12},
 safe:{flex:1,height:Platform.OS==="web"?"100vh":undefined,minHeight:Platform.OS==="web"?"100vh":undefined,width:"100%",maxWidth:480,alignSelf:"center",overflow:"hidden",backgroundColor:C.bg,paddingTop:Platform.OS==="android"?(StatusBar.currentHeight||24):0},safeHome:{backgroundColor:"#002D28"},body:{flex:1,minHeight:0,width:"100%"},content:{flexGrow:1,padding:17,paddingBottom:28},homePage:{marginHorizontal:-17,marginTop:-17,paddingHorizontal:16,paddingTop:16,paddingBottom:28,backgroundColor:"#002D28",overflow:"hidden"},homePageGradient:{position:"absolute",top:0,right:0,bottom:0,left:0,zIndex:0},
homeHeader:{height:102,width:"100%",alignSelf:"stretch",borderRadius:8,overflow:"hidden",marginBottom:12,backgroundColor:"#003A34",justifyContent:"center"},
homeHeaderPhoto:{position:"absolute",top:0,right:0,bottom:0,left:0,width:"100%",height:"100%",zIndex:0},







homeSettingsButton:{position:"absolute",right:9,bottom:7,width:29,height:29,borderRadius:15,backgroundColor:"rgba(0,28,24,0.68)",borderWidth:1,borderColor:"rgba(255,255,255,0.62)",alignItems:"center",justifyContent:"center",zIndex:3},
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
featureCard:{width:"31.25%",minHeight:124,backgroundColor:"#F2FBF6",borderRadius:16,overflow:"hidden",alignItems:"center",justifyContent:"center",paddingHorizontal:5,paddingVertical:11,borderWidth:1.2,borderColor:"#B9E8D5",shadowColor:"#002D28",shadowOpacity:.12,shadowRadius:7,shadowOffset:{width:0,height:3},elevation:3},featureWave:{position:"absolute",bottom:0,left:0,right:0,zIndex:0},
featureIconHalo:{width:48,height:48,borderRadius:24,borderWidth:1.5,alignItems:"center",justifyContent:"center",backgroundColor:"#FFFFFF",shadowColor:"#0B6D58",shadowOpacity:.16,shadowRadius:7,shadowOffset:{width:0,height:1},elevation:2,zIndex:1},
featureIcon:{fontSize:31,color:"#FFFFFF"},
featureLabel:{fontSize:12.5,fontWeight:"900",color:"#123C32",marginTop:7,textAlign:"center",zIndex:1},
featureSub:{fontSize:9.5,color:"#60786F",lineHeight:13,textAlign:"center",marginTop:3,zIndex:1},
comingSoon:{fontSize:8,fontWeight:"900",letterSpacing:.8,color:"#A87316",marginTop:5},
homeFooter:{fontSize:11,color:"#E1EFE8",textAlign:"center",marginTop:19,lineHeight:18,paddingHorizontal:14},homeFooterDecor:{flexDirection:"row",alignItems:"center",justifyContent:"center",gap:13,marginTop:20},homeFooterLine:{height:2,width:48,backgroundColor:"#E9BE54",borderRadius:2},homeFooterCross:{fontSize:26,color:"#F4C85D",fontWeight:"900"},button:{backgroundColor:C.blue,borderRadius:10,paddingVertical:13,paddingHorizontal:14,alignItems:"center",justifyContent:"center",flex:1,marginTop:9},buttonOutline:{backgroundColor:C.white,borderWidth:1,borderColor:C.blue},buttonText:{color:C.white,fontSize:13,fontWeight:"800"},dailyHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},sectionTitle:{fontSize:19,fontWeight:"900",color:C.ink,marginTop:21,marginBottom:12},kicker:{fontSize:10,color:C.blue,fontWeight:"900",letterSpacing:1.1},dailyCard:{backgroundColor:C.white,borderRadius:17,padding:18,borderWidth:1,borderColor:C.line,marginBottom:8},dailyRef:{fontSize:16,fontWeight:"900",color:C.blue},dailyText:{fontSize:17,lineHeight:28,color:C.ink,marginTop:9},dailyFoot:{fontSize:12,color:C.blue,fontWeight:"800",marginTop:13},resumeCard:{backgroundColor:C.white,borderRadius:16,padding:17,flexDirection:"row",alignItems:"center",borderWidth:1,borderColor:C.line},cardTitle:{fontSize:16,fontWeight:"900",color:C.ink},muted:{fontSize:12,color:C.muted,lineHeight:19,marginTop:5},cardArrow:{fontSize:26,color:C.blue,marginLeft:10},twoCards:{flexDirection:"row",gap:12},testamentCard:{flex:1,backgroundColor:C.pale,borderRadius:15,padding:16,minHeight:120,borderWidth:1,borderColor:"#BEDAF7"},cardEmoji:{fontSize:26,marginBottom:9},readerHeader:{backgroundColor:C.pale,marginHorizontal:-17,marginTop:-17,paddingHorizontal:12,paddingVertical:8,flexDirection:"row",alignItems:"center",gap:7,borderBottomWidth:1,borderColor:"#C6DDF5"},headerAction:{width:42,height:44,alignItems:"center",justifyContent:"center",borderRadius:9},headerActionText:{fontSize:25,color:C.blue,fontWeight:"600"},bookChapter:{flex:1,alignItems:"center",paddingVertical:10,borderWidth:1.5,borderColor:C.blue,borderRadius:8,backgroundColor:"#EAF4FF"},bookChapterText:{fontSize:16,color:C.blue,fontWeight:"800"},chapterStrip:{marginHorizontal:-17,backgroundColor:C.white,maxHeight:67,borderBottomWidth:1,borderColor:C.line},chapterStripContent:{paddingHorizontal:12,alignItems:"center",gap:10},chapterPill:{width:40,height:40,borderRadius:23,borderWidth:1.5,borderColor:"#263443",alignItems:"center",justifyContent:"center",marginVertical:9},chapterPillActive:{backgroundColor:C.blue,borderColor:C.blue},chapterPillText:{fontSize:16,color:C.ink},chapterPillTextActive:{color:C.white},readerActions:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:15},readerTitle:{fontSize:19,fontWeight:"800",color:C.ink},inlineActions:{flexDirection:"row",gap:9,alignItems:"center"},inlineActionText:{color:C.blue,fontSize:12,fontWeight:"900"},verseList:{backgroundColor:C.white,paddingHorizontal:2,paddingVertical:5,marginTop:8},verseRow:{flexDirection:"row",alignItems:"flex-start",paddingVertical:12,borderBottomWidth:0,gap:8},verseActive:{backgroundColor:"#E7F2FF",borderRadius:8,paddingHorizontal:7},verseNumber:{fontSize:17,color:C.ink,fontWeight:"500",minWidth:18,marginTop:2},verseText:{flex:1,color:"#111111",fontSize:18,lineHeight:28,fontFamily:"sans-serif"},copyright:{fontSize:10,color:C.muted,lineHeight:16,paddingVertical:12},chapterFooter:{flexDirection:"row",gap:10,marginTop:10},emptyBox:{backgroundColor:C.white,padding:20,borderRadius:14,marginTop:16,borderWidth:1,borderColor:C.line},emptyTitle:{fontSize:18,fontWeight:"900",color:C.ink},error:{color:C.red,backgroundColor:"#FCEBEC",padding:13,borderRadius:10,marginTop:12,lineHeight:20},pageHeading:{fontSize:27,fontWeight:"900",color:C.ink,marginTop:9,marginBottom:8},searchTopBar:{flexDirection:"row",justifyContent:"flex-start",marginBottom:8},searchHomeButton:{flexDirection:"row",alignItems:"center",alignSelf:"flex-start",gap:8,backgroundColor:"#EAF4FF",borderWidth:1,borderColor:C.blue,borderRadius:12,paddingHorizontal:16,paddingVertical:10},searchHomeIcon:{fontSize:22,color:C.blue,fontWeight:"900",lineHeight:24},searchHomeText:{fontSize:14,color:C.blue,fontWeight:"900"},searchLoading:{backgroundColor:C.white,borderRadius:14,padding:18,alignItems:"center",gap:10,marginTop:14},searchResultCount:{fontSize:13,color:C.blue,fontWeight:"800",marginTop:18,marginBottom:4},searchOpenHint:{fontSize:11,color:C.blue,fontWeight:"800",marginTop:9},searchInput:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:12,padding:14,color:C.ink,fontSize:15,marginTop:17,marginBottom:8},resultCard:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:13,padding:15,marginTop:12},resultText:{fontSize:15,color:C.ink,lineHeight:24,marginTop:8},savedRow:{backgroundColor:C.white,borderRadius:13,padding:15,marginBottom:9,borderWidth:1,borderColor:C.line},settingsTopBar:{flexDirection:"row",justifyContent:"flex-start",marginBottom:8},settingsHomeButton:{flexDirection:"row",alignItems:"center",alignSelf:"flex-start",gap:8,backgroundColor:"#EAF4FF",borderWidth:1,borderColor:C.blue,borderRadius:12,paddingHorizontal:16,paddingVertical:10},settingsHomeIcon:{fontSize:22,color:C.blue,fontWeight:"900",lineHeight:24},settingsHomeText:{fontSize:14,color:C.blue,fontWeight:"900"},settingsCard:{backgroundColor:C.white,borderRadius:16,padding:16,borderWidth:1,borderColor:C.line,marginTop:16},translationName:{fontSize:19,fontWeight:"900",color:C.ink,marginTop:8},translationId:{fontSize:11,color:C.muted,marginTop:4},translationOption:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:10,backgroundColor:"#F4F8FC",padding:12,borderRadius:11,marginTop:8,borderWidth:1,borderColor:C.line},translationOptionActive:{borderColor:C.blue,borderWidth:2,backgroundColor:"#EAF4FF"},translationOptionTitle:{fontSize:14,fontWeight:"800",color:C.ink},translationCheck:{fontSize:11,fontWeight:"800",color:C.blue},audioAvailabilityMessage:{fontSize:12,lineHeight:19,padding:12,borderRadius:10,marginTop:10},audioAvailable:{color:"#166534",backgroundColor:"#DCFCE7"},audioUnavailable:{color:"#991B1B",backgroundColor:"#FEE2E2"},audioCheckNeutral:{color:C.ink,backgroundColor:"#EEF3F8"},versionRow:{backgroundColor:"#F4F8FC",padding:13,borderRadius:11,marginTop:9,borderWidth:1,borderColor:C.line},versionSelected:{borderColor:C.blue,borderWidth:2},linkText:{fontSize:11,color:C.blue,marginTop:8},noteCard:{backgroundColor:C.white,borderRadius:14,padding:14,marginTop:12},noteInput:{minHeight:90,color:C.ink,textAlignVertical:"top",padding:10},modalShade:{flex:1,backgroundColor:"rgba(0,0,0,.48)",flexDirection:"row"},scrim:{flex:1},drawer:{width:"84%",maxWidth:390,backgroundColor:C.white},drawerHead:{height:58,backgroundColor:"#1684F5",paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},drawerTitle:{color:C.white,fontSize:19,fontWeight:"900"},closeText:{fontSize:25,color:C.blue,fontWeight:"700"},drawerSearch:{margin:12,padding:12,borderRadius:8,borderWidth:1,borderColor:C.line,color:C.ink},drawerItem:{paddingHorizontal:17,paddingVertical:15,borderBottomWidth:1,borderBottomColor:"#E3E7EC",flexDirection:"row",justifyContent:"space-between",alignItems:"center"},drawerItemActive:{backgroundColor:"#E8F3FF"},drawerItemText:{fontSize:16,color:C.ink},drawerCount:{fontSize:11,color:C.muted},pickerPanel:{backgroundColor:C.white,width:"100%",maxHeight:"88%",marginTop:"auto",borderTopLeftRadius:18,borderTopRightRadius:18,overflow:"hidden"},pickerHead:{height:58,backgroundColor:C.pale,paddingHorizontal:15,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},pickerTitle:{fontSize:19,color:C.blue,fontWeight:"800"},cancelText:{fontSize:15,color:C.blue,fontWeight:"700"},pickerTabs:{height:48,backgroundColor:"#1684F5",flexDirection:"row"},pickerTab:{flex:1,alignItems:"center",justifyContent:"center",borderBottomWidth:3,borderBottomColor:"transparent"},pickerTabActive:{borderBottomColor:"#16A05A"},pickerTabText:{fontSize:13,color:"#063B70",fontWeight:"800"},pickerBookList:{paddingBottom:20},pickerBookItem:{paddingHorizontal:18,paddingVertical:14,borderBottomWidth:1,borderBottomColor:"#D5D5D5",flexDirection:"row",justifyContent:"space-between"},pickerBookText:{fontSize:17,color:C.ink},pickerGrid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-around",padding:10},pickerNumber:{width:"18%",height:64,alignItems:"center",justifyContent:"center",marginVertical:4,borderRadius:32},pickerNumberActive:{backgroundColor:"#328FE5"},pickerNumberText:{fontSize:19,color:C.ink}
});
