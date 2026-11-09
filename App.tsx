import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable,
  SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, TextInput, View
} from "react-native";
import { BOOKS, BibleBook } from "./src/data/books";
import { ApiBible, ApiIndexBook, getBibleIndex, getHindiBibles, getPassage, searchVerses } from "./src/lib/bibleApi";
import { SavedReference, storage } from "./src/lib/storage";

type Tab = "home" | "bible" | "search" | "saved" | "settings";
type Passage = { id:string; content:string; reference:string };
const C = { bg:"#0B1422", panel:"#142236", panel2:"#1B2B40", gold:"#D7B36A", cream:"#F3EBD9", muted:"#A7B2C1", line:"#293A50", green:"#8DBA9A", red:"#E59A8B" };

function Action({label,onPress,secondary=false}: {label:string;onPress:()=>void;secondary?:boolean}) {
  return <Pressable onPress={onPress} style={[s.action, secondary && s.actionSecondary]}><Text style={[s.actionText,secondary&&{color:C.cream}]}>{label}</Text></Pressable>;
}
function Header({title,subtitle}: {title:string;subtitle?:string}) {
  return <View style={s.header}><Text style={s.brand}>✦ WORD & LIGHT</Text><Text style={s.pageTitle}>{title}</Text>{!!subtitle&&<Text style={s.subtitle}>{subtitle}</Text>}</View>;
}

export default function App() {
  const [tab,setTab] = useState<Tab>("home");
  const [apiKey,setApiKey] = useState("");
  const [bibleId,setBibleId] = useState("");
  const [versions,setVersions] = useState<ApiBible[]>([]);
  const [catalog,setCatalog] = useState<ApiIndexBook[]>([]);
  const [book,setBook] = useState<BibleBook>(BOOKS[42]);
  const [chapter,setChapter] = useState(1);
  const [passage,setPassage] = useState<Passage|null>(null);
  const [loading,setLoading] = useState(false);
  const [error,setError] = useState("");
  const [filter,setFilter] = useState("");
  const [testament,setTestament] = useState<"all"|"old_testament"|"new_testament">("all");
  const [query,setQuery] = useState("");
  const [results,setResults] = useState<{reference:string;passage?:Passage}[]>([]);
  const [bookmarks,setBookmarks] = useState<SavedReference[]>([]);
  const [history,setHistory] = useState<SavedReference[]>([]);
  const [notes,setNotes] = useState<Record<string,string>>({});
  const [fontSize,setFontSize] = useState(19);
  const [noteText,setNoteText] = useState("");
  const [showNote,setShowNote] = useState(false);
  const [daily,setDaily] = useState<Passage|null>(null);

  useEffect(() => {
    (async()=>{
      const [key,id,bm,hist,n,fz] = await Promise.all([storage.getApiKey(),storage.getBibleId(),storage.getBookmarks(),storage.getHistory(),storage.getNotes(),storage.getFontSize()]);
      setApiKey(key || ""); setBibleId(id); setBookmarks(bm); setHistory(hist); setNotes(n); setFontSize(fz);
    })();
  },[]);

  useEffect(()=>{
    if (!bibleId) return;
    (async()=>{
      try {
        const [idx,verse] = await Promise.all([getBibleIndex("",bibleId),getPassage("",bibleId,"JHN.3.16")]);
        setCatalog(idx); setDaily(verse);
      } catch(e) { setError(e instanceof Error ? e.message : "Bible data load नहीं हुआ।"); }
    })();
  },[apiKey,bibleId]);

  const chapterCount = useMemo(()=>catalog.find(x=>x.id===book.id)?.chapters.length || book.chapters,[catalog,book]);
  const filteredBooks = useMemo(()=>BOOKS.filter(b=>(testament==="all"||b.testament===testament) && (b.hindi.toLowerCase().includes(filter.toLowerCase())||b.english.toLowerCase().includes(filter.toLowerCase()))),[filter,testament]);

  async function openChapter(nextBook: BibleBook, nextChapter:number) {
    setBook(nextBook); setChapter(nextChapter); setTab("bible"); setPassage(null); setError(""); setShowNote(false);
    const ref = `${nextBook.id}.${nextChapter}`;
    setNoteText(notes[ref] || "");
    if (!bibleId) { setError("पहले Settings में उपलब्ध Hindi Bible Translation चुनें।"); return; }
    setLoading(true);
    try {
      const data = await getPassage("",bibleId,ref);
      setPassage(data);
      const item: SavedReference = {id:ref,reference:`${nextBook.hindi} ${nextChapter}`,bookId:nextBook.id,chapter:nextChapter,createdAt:Date.now()};
      const updated = [item,...history.filter(x=>x.id!==ref)].slice(0,40);
      setHistory(updated); await storage.setHistory(updated);
    } catch(e) { setError(e instanceof Error ? e.message : "अध्याय लोड नहीं हुआ।"); }
    finally { setLoading(false); }
  }

  async function toggleBookmark() {
    const id = `${book.id}.${chapter}`;
    const exists = bookmarks.some(x=>x.id===id);
    const item: SavedReference = {id,reference:`${book.hindi} ${chapter}`,bookId:book.id,chapter,createdAt:Date.now()};
    const updated = exists ? bookmarks.filter(x=>x.id!==id) : [item,...bookmarks];
    setBookmarks(updated); await storage.setBookmarks(updated);
    Alert.alert(exists ? "Bookmark हटाया" : "Bookmark सेव हुआ");
  }

  async function runSearch() {
    if (!bibleId) { Alert.alert("सेटअप जरूरी है","पहले Settings में Hindi Bible Translation चुनें।"); return; }
    if (!query.trim()) return;
    setLoading(true); setError(""); setResults([]);
    try {
      const refs = await searchVerses("",bibleId,query.trim());
      const mapped = await Promise.all(refs.slice(0,12).map(async item=>{
        const id = item.reference || item.passage_id || "";
        let text: Passage|undefined;
        try { text = await getPassage(apiKey,bibleId,id); } catch {}
        return {reference:id,passage:text};
      }));
      setResults(mapped);
    } catch(e) { setError(e instanceof Error ? e.message : "Search नहीं हुआ।"); }
    finally { setLoading(false); }
  }

  async function saveSettings() {
    await storage.setBibleId(bibleId);
    Alert.alert("सेटिंग सेव हुई","अब Bible tab में अध्याय खोलें।");
  }

  function openSearchResult(ref:string) {
    const parts=ref.split(".");
    const target=BOOKS.find(x=>x.id===parts[0]);
    if(target) openChapter(target,Number(parts[1])||1);
  }

  const currentSaved = bookmarks.some(x=>x.id===`${book.id}.${chapter}`);
  const activeTitle = tab==="home"?"आज का वचन":tab==="bible"?"पवित्र बाइबल":tab==="search"?"वचन खोजें":tab==="saved"?"आपकी लाइब्रेरी":"सेटिंग्स";

  return (
    <SafeAreaView style={s.safe}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg}/>
      <View style={s.topbar}><Text style={s.logo}>✦</Text><Text style={s.topbarName}>HINDI BIBLE</Text><Text style={s.topbarTag}>WORD • FAITH • LIFE</Text></View>
      <ScrollView style={s.body} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
        {tab==="home" && <>
          <Header title="वचन में आपका स्वागत है" subtitle="हर दिन परमेश्वर के वचन के साथ एक नई शुरुआत।"/>
          <View style={s.hero}>
            <Text style={s.eyebrow}>VERSE OF THE DAY</Text>
            <Text style={s.heroRef}>यूहन्ना 3:16</Text>
            <Text style={s.heroVerse}>{daily?.content || "परमेश्वर के प्रेम और उसके वचन को प्रतिदिन पढ़ें।"}</Text>
            <Text style={s.heroFoot}>{daily?.reference || "John 3:16"} • Hindi Bible</Text>
          </View>
          <Text style={s.sectionTitle}>पढ़ना जारी रखें</Text>
          {history[0] ? <Pressable style={s.resumeCard} onPress={()=>openChapter(BOOKS.find(x=>x.id===history[0].bookId)||BOOKS[42],history[0].chapter)}><View><Text style={s.cardKicker}>LAST READ</Text><Text style={s.cardTitle}>{history[0].reference}</Text><Text style={s.muted}>अपनी पढ़ाई वहीं से जारी रखें</Text></View><Text style={s.arrow}>→</Text></Pressable> : <Text style={s.empty}>आपकी Reading History यहाँ दिखाई देगी।</Text>}
          <Text style={s.sectionTitle}>बाइबल के भाग</Text>
          <View style={s.twoCards}>
            <Pressable style={s.testamentCard} onPress={()=>{setTestament("old_testament");setTab("bible");}}><Text style={s.cardKicker}>39 BOOKS</Text><Text style={s.cardTitle}>पुराना नियम</Text><Text style={s.muted}>Old Testament</Text></Pressable>
            <Pressable style={s.testamentCard} onPress={()=>{setTestament("new_testament");setTab("bible");}}><Text style={s.cardKicker}>27 BOOKS</Text><Text style={s.cardTitle}>नया नियम</Text><Text style={s.muted}>New Testament</Text></Pressable>
          </View>
          <Text style={s.sectionTitle}>जल्दी पढ़ें</Text>
          <View style={s.quickRow}>{["JHN","MAT","PSA","GEN"].map(id=>{const b=BOOKS.find(x=>x.id===id)!;return <Pressable key={id} style={s.quick} onPress={()=>openChapter(b,1)}><Text style={s.quickName}>{b.hindi}</Text><Text style={s.muted}>{b.english}</Text></Pressable>;})}</View>
        </>}

        {tab==="bible" && <>
          <Header title={passage ? `${book.hindi} ${chapter}` : "पुस्तक चुनें"} subtitle={passage ? book.english : "66 पुस्तकों में से पढ़ना शुरू करें"}/>
          {!passage && <View style={s.segment}><Pressable onPress={()=>setTestament("all")} style={[s.segmentBtn,testament==="all"&&s.segmentActive]}><Text style={s.segmentText}>सभी</Text></Pressable><Pressable onPress={()=>setTestament("old_testament")} style={[s.segmentBtn,testament==="old_testament"&&s.segmentActive]}><Text style={s.segmentText}>पुराना नियम</Text></Pressable><Pressable onPress={()=>setTestament("new_testament")} style={[s.segmentBtn,testament==="new_testament"&&s.segmentActive]}><Text style={s.segmentText}>नया नियम</Text></Pressable></View>}
          {!passage && <TextInput value={filter} onChangeText={setFilter} placeholder="पुस्तक खोजें / Search books" placeholderTextColor={C.muted} style={s.input}/>}
          {!passage && <View style={s.bookGrid}>{filteredBooks.map(item=><Pressable key={item.id} style={s.bookTile} onPress={()=>{setBook(item);setPassage(null);setChapter(1);}}><Text style={s.bookHindi}>{item.hindi}</Text><Text style={s.bookEnglish}>{item.english}</Text><Text style={s.bookCount}>{item.chapters} अध्याय</Text><View style={s.tileAction}><Text style={s.tileActionText}>अध्याय चुनें →</Text></View></Pressable>)}</View>}
          {!passage && catalog.length>0 && <Text style={s.muted}>आपकी चुनी हुई Bible Version में {catalog.length} पुस्तकें उपलब्ध हैं।</Text>}
          {!passage && <View style={s.chapterPicker}><Text style={s.sectionTitle}>{book.hindi} — अध्याय चुनें</Text><View style={s.numberGrid}>{Array.from({length:chapterCount},(_,i)=>i+1).map(n=><Pressable key={n} style={s.number} onPress={()=>openChapter(book,n)}><Text style={s.numberText}>{n}</Text></Pressable>)}</View></View>}
          {passage && <><View style={s.readerTools}><Action label="← पुस्तकें" secondary onPress={()=>setPassage(null)}/><Action label={currentSaved?"★ Saved":"☆ Bookmark"} onPress={toggleBookmark}/></View><View style={s.chapterNav}><Action label="← पिछला" secondary onPress={()=>openChapter(book,Math.max(1,chapter-1))}/><Text style={s.chapterLabel}>अध्याय {chapter}</Text><Action label="अगला →" secondary onPress={()=>openChapter(book,Math.min(chapterCount,chapter+1))}/></View><View style={s.reader}><Text style={[s.passageText,{fontSize,lineHeight:fontSize*1.85}]}>{passage.content}</Text><Text style={s.copyright}>{passage.reference} • Scripture content supplied by the selected Bible publisher.</Text></View><View style={s.readerTools}><Action label="A−" secondary onPress={()=>{const v=Math.max(15,fontSize-1);setFontSize(v);storage.setFontSize(v);}}/><Action label="A+" secondary onPress={()=>{const v=Math.min(28,fontSize+1);setFontSize(v);storage.setFontSize(v);}}/><Action label="✎ नोट" onPress={()=>setShowNote(v=>!v)}/></View>{showNote&&<View style={s.noteBox}><Text style={s.sectionTitle}>मेरे नोट्स</Text><TextInput value={noteText} onChangeText={setNoteText} multiline placeholder="इस अध्याय के बारे में अपने विचार लिखें..." placeholderTextColor={C.muted} style={[s.input,{height:110,textAlignVertical:"top"}]}/><Action label="नोट सेव करें" onPress={async()=>{const next={...notes,[`${book.id}.${chapter}`]:noteText};setNotes(next);await storage.setNotes(next);Alert.alert("सेव हो गया","आपका नोट इस डिवाइस पर सेव है।");}}/></View>}</>}
          {loading&&<ActivityIndicator color={C.gold} size="large" style={{margin:20}}/>}
          {!!error&&<Text style={s.error}>{error}</Text>}
        </>}

        {tab==="search" && <>
          <Header title="बाइबल में खोजें" subtitle="किसी शब्द, विषय या वचन को खोजें।"/>
          <TextInput value={query} onChangeText={setQuery} placeholder="जैसे: John 3:16 या JHN.3.16" placeholderTextColor={C.muted} style={s.input} onSubmitEditing={runSearch}/>
          <Action label="Reference खोलें  →" onPress={runSearch}/>
          {loading&&<ActivityIndicator color={C.gold} size="large" style={{margin:20}}/>}
          {!!error&&<Text style={s.error}>{error}</Text>}
          {results.map((r,i)=><Pressable key={r.reference+i} style={s.resultCard} onPress={()=>openSearchResult(r.reference)}><Text style={s.cardKicker}>{r.reference}</Text><Text style={s.resultText}>{r.passage?.content || "वचन खोलने के लिए टैप करें"}</Text></Pressable>)}
          {!results.length&&!loading&&<Text style={s.empty}>Search results यहाँ दिखाई देंगे।</Text>}
        </>}

        {tab==="saved" && <>
          <Header title="आपकी लाइब्रेरी" subtitle="आपके सेव किए गए वचन और पढ़ने का इतिहास।"/>
          <Text style={s.sectionTitle}>Bookmarks ({bookmarks.length})</Text>
          {bookmarks.map(item=><Pressable key={item.id} style={s.savedRow} onPress={()=>openChapter(BOOKS.find(x=>x.id===item.bookId)||BOOKS[42],item.chapter)}><Text style={s.savedTitle}>☆  {item.reference}</Text><Text style={s.muted}>अध्याय खोलें →</Text></Pressable>)}
          {!bookmarks.length&&<Text style={s.empty}>अभी कोई bookmark सेव नहीं है।</Text>}
          <Text style={s.sectionTitle}>हाल ही में पढ़े ({history.length})</Text>
          {history.slice(0,15).map(item=><Pressable key={item.id} style={s.savedRow} onPress={()=>openChapter(BOOKS.find(x=>x.id===item.bookId)||BOOKS[42],item.chapter)}><Text style={s.savedTitle}>{item.reference}</Text><Text style={s.muted}>फिर से पढ़ें →</Text></Pressable>)}
        </>}

        {tab==="settings" && <>
          <Header title="सेटिंग्स" subtitle="Bible content provider और reading preferences"/>
          <View style={s.settingsCard}>
            <Text style={s.sectionTitle}>YouVersion Platform API</Text>
            <Text style={s.muted}>अपना App Key डालें। यह आपके डिवाइस पर सेव होगा। इसे GitHub में commit न करें।</Text>
            <TextInput value={apiKey} onChangeText={setApiKey} placeholder="YouVersion App Key" placeholderTextColor={C.muted} autoCapitalize="none" style={s.input} secureTextEntry/>
            <Action label="हिंदी Bible Versions खोजें" onPress={async()=>{try{const list=await getHindiBibles(apiKey);setVersions(list);if(!list.length)Alert.alert("कोई version नहीं मिला","इस App Key को Hindi Bible content की अनुमति नहीं मिली हो सकती।");}catch(e){Alert.alert("API Error",e instanceof Error?e.message:"Request failed");}}}/>
            {versions.map(v=><Pressable key={v.id} style={[s.versionRow,bibleId===v.id&&s.versionSelected]} onPress={()=>setBibleId(v.id)}><Text style={s.savedTitle}>{v.localized_title||v.title}</Text><Text style={s.muted}>ID: {v.id} • {v.localized_abbreviation||v.abbreviation}</Text>{!!v.copyright&&<Text style={s.copyright}>{v.copyright}</Text>}</Pressable>)}
            
            <Action label="सेटिंग्स सेव करें" onPress={saveSettings}/>
            <Text style={s.helpLink}>Free API documentation: bible.helloao.org</Text>
          </View>
          <View style={s.settingsCard}><Text style={s.sectionTitle}>Reading Preferences</Text><Text style={s.muted}>अक्षरों का आकार: {fontSize}</Text><View style={s.readerTools}><Action label="A−" secondary onPress={()=>{const v=Math.max(15,fontSize-1);setFontSize(v);storage.setFontSize(v);}}/><Action label="A+" secondary onPress={()=>{const v=Math.min(28,fontSize+1);setFontSize(v);storage.setFontSize(v);}}/></View></View>
          <Text style={s.copyright}>Hindi Bible • Version 1.0.0{"\n"}Scripture text is provided by the selected publisher and remains subject to its license and attribution requirements.</Text>
        </>}
      </ScrollView>
      <View style={s.tabbar}>
        {([{id:"home",icon:"⌂",label:"होम"},{id:"bible",icon:"▤",label:"बाइबल"},{id:"search",icon:"⌕",label:"खोजें"},{id:"saved",icon:"☆",label:"सेव"},{id:"settings",icon:"⚙",label:"सेटिंग"}] as {id:Tab;icon:string;label:string}[]).map(item=><Pressable key={item.id} style={s.tab} onPress={()=>{setTab(item.id);setPassage(null);setError("");}}><Text style={[s.tabIcon,tab===item.id&&{color:C.gold}]}>{item.icon}</Text><Text style={[s.tabLabel,tab===item.id&&{color:C.gold}]}>{item.label}</Text></Pressable>)}
      </View>
    </SafeAreaView>
  );
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:C.bg},topbar:{height:58,paddingHorizontal:20,flexDirection:"row",alignItems:"center",borderBottomWidth:1,borderBottomColor:C.line},logo:{color:C.gold,fontSize:25,marginRight:9},topbarName:{color:C.cream,fontWeight:"800",letterSpacing:2,fontSize:14},topbarTag:{color:C.muted,fontSize:9,letterSpacing:1.5,marginLeft:"auto"},body:{flex:1},content:{padding:20,paddingBottom:36},header:{marginTop:8,marginBottom:22},brand:{color:C.gold,fontSize:10,letterSpacing:3,fontWeight:"800",marginBottom:12},pageTitle:{color:C.cream,fontSize:29,fontWeight:"800"},subtitle:{color:C.muted,fontSize:13,marginTop:7,lineHeight:20},hero:{backgroundColor:"#1D3047",borderRadius:22,padding:23,borderWidth:1,borderColor:"#43546A",marginBottom:28},eyebrow:{color:C.gold,fontSize:10,fontWeight:"800",letterSpacing:2},heroRef:{color:C.cream,fontSize:24,fontWeight:"800",marginTop:14},heroVerse:{color:"#F4EBDD",fontSize:18,lineHeight:31,marginTop:13},heroFoot:{color:C.muted,fontSize:11,marginTop:16},sectionTitle:{color:C.cream,fontSize:18,fontWeight:"800",marginTop:22,marginBottom:13},resumeCard:{backgroundColor:C.panel,borderRadius:16,padding:18,flexDirection:"row",alignItems:"center",justifyContent:"space-between",borderWidth:1,borderColor:C.line},cardKicker:{color:C.gold,fontSize:9,letterSpacing:1.5,fontWeight:"800"},cardTitle:{color:C.cream,fontSize:18,fontWeight:"800",marginTop:6},muted:{color:C.muted,fontSize:12,marginTop:5,lineHeight:19},arrow:{color:C.gold,fontSize:25},twoCards:{flexDirection:"row",gap:12},testamentCard:{flex:1,backgroundColor:C.panel,borderRadius:16,padding:16,borderWidth:1,borderColor:C.line,minHeight:112},quickRow:{flexDirection:"row",flexWrap:"wrap",gap:8},quick:{backgroundColor:C.panel,borderRadius:12,padding:12,borderWidth:1,borderColor:C.line,minWidth:"47%",flexGrow:1},quickName:{color:C.cream,fontWeight:"700",fontSize:15},segment:{flexDirection:"row",backgroundColor:C.panel,borderRadius:12,padding:4,marginBottom:14},segmentBtn:{flex:1,padding:10,alignItems:"center",borderRadius:9},segmentActive:{backgroundColor:C.gold},segmentText:{color:C.cream,fontSize:11,fontWeight:"700"},input:{backgroundColor:C.panel,color:C.cream,borderRadius:13,paddingHorizontal:15,paddingVertical:13,borderWidth:1,borderColor:C.line,fontSize:15,marginBottom:12},bookGrid:{flexDirection:"row",flexWrap:"wrap",gap:10},bookTile:{width:"48%",backgroundColor:C.panel,borderRadius:15,padding:14,borderWidth:1,borderColor:C.line,minHeight:125},bookHindi:{color:C.cream,fontSize:16,fontWeight:"800"},bookEnglish:{color:C.muted,fontSize:11,marginTop:4},bookCount:{color:C.gold,fontSize:10,marginTop:8},tileAction:{borderTopWidth:1,borderTopColor:C.line,marginTop:10,paddingTop:8},tileActionText:{color:C.gold,fontSize:11,fontWeight:"700"},chapterPicker:{marginTop:4},numberGrid:{flexDirection:"row",flexWrap:"wrap",gap:9},number:{width:46,height:46,alignItems:"center",justifyContent:"center",borderRadius:12,backgroundColor:C.panel,borderWidth:1,borderColor:C.line},numberText:{color:C.cream,fontWeight:"700",fontSize:15},readerTools:{flexDirection:"row",justifyContent:"space-between",gap:8,marginVertical:12},action:{backgroundColor:C.gold,paddingVertical:12,paddingHorizontal:14,borderRadius:12,alignItems:"center",justifyContent:"center",flex:1},actionSecondary:{backgroundColor:C.panel,borderWidth:1,borderColor:C.line},actionText:{color:C.bg,fontWeight:"800",fontSize:12},chapterNav:{flexDirection:"row",alignItems:"center",gap:8,marginVertical:10},chapterLabel:{color:C.cream,fontWeight:"800",flex:1,textAlign:"center"},reader:{backgroundColor:"#F4EBDD",borderRadius:18,padding:22,marginTop:8,marginBottom:10},passageText:{color:"#29251F",fontFamily:Platform.OS==="ios"?"Georgia":"serif"},copyright:{color:C.muted,fontSize:10,lineHeight:16,marginTop:12},noteBox:{backgroundColor:C.panel,borderRadius:16,padding:16,marginTop:10},error:{color:C.red,backgroundColor:"#3A2026",padding:13,borderRadius:12,marginVertical:12,lineHeight:20},empty:{color:C.muted,backgroundColor:C.panel,padding:16,borderRadius:12,lineHeight:20},resultCard:{backgroundColor:C.panel,borderRadius:14,padding:16,marginTop:12,borderWidth:1,borderColor:C.line},resultText:{color:C.cream,fontSize:15,lineHeight:24,marginTop:7},savedRow:{backgroundColor:C.panel,borderRadius:13,padding:15,marginBottom:9,borderWidth:1,borderColor:C.line},savedTitle:{color:C.cream,fontSize:15,fontWeight:"700"},settingsCard:{backgroundColor:C.panel,borderRadius:16,padding:16,borderWidth:1,borderColor:C.line,marginBottom:15},versionRow:{backgroundColor:C.panel2,padding:12,borderRadius:12,marginTop:8,borderWidth:1,borderColor:C.line},versionSelected:{borderColor:C.gold},helpLink:{color:C.gold,fontSize:12,marginTop:12},tabbar:{height:70,backgroundColor:"#101D2D",borderTopWidth:1,borderTopColor:C.line,flexDirection:"row",justifyContent:"space-around",alignItems:"center",paddingBottom:5},tab:{alignItems:"center",justifyContent:"center",flex:1},tabIcon:{color:C.muted,fontSize:22},tabLabel:{color:C.muted,fontSize:10,marginTop:3,fontWeight:"600"}
});