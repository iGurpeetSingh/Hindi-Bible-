import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Modal, Platform, Pressable, SafeAreaView,
  ScrollView, StatusBar, StyleSheet, Text, TextInput, View
} from "react-native";
import * as Speech from "expo-speech";
import { BOOKS, BibleBook } from "./src/data/books";
import { ApiBible, ApiIndexBook, getBibleIndex, getHindiBibles, getPassage, searchVerses } from "./src/lib/bibleApi";
import { SavedReference, storage } from "./src/lib/storage";

type Tab = "home" | "bible" | "search" | "saved" | "settings";
type Passage = { id:string; content:string; reference:string; copyright?:string };
type PickerTab = "BOOK" | "CHAPTER" | "VERSE";
const C = { bg:"#F4F7FB", blue:"#0879E8", blueDark:"#075CB5", pale:"#D9EBFF", ink:"#172536", muted:"#66778B", line:"#D7E1EC", white:"#FFFFFF", gold:"#D6A64D", green:"#0E6256", red:"#A33D42" };

function Button({label,onPress,outline=false,disabled=false}:{label:string;onPress:()=>void;outline?:boolean;disabled?:boolean}) {
  return <Pressable disabled={disabled} onPress={onPress} style={[s.button,outline&&s.buttonOutline,disabled&&{opacity:.45}]}><Text style={[s.buttonText,outline&&{color:C.blue}]}>{label}</Text></Pressable>;
}
function verseItems(content:string) {
  return content.split(/\n\s*\n/).map((line)=>line.trim()).filter(Boolean).map((line)=> {
    const m=line.match(/^(\d+)\.\s*([\s\S]*)$/);
    return m ? {number:Number(m[1]),text:m[2]} : {number:0,text:line};
  });
}

export default function App() {
  const [tab,setTab]=useState<Tab>("home");
  const [bibleId,setBibleId]=useState("");
  const [versions,setVersions]=useState<ApiBible[]>([]);
  const [catalog,setCatalog]=useState<ApiIndexBook[]>([]);
  const [book,setBook]=useState<BibleBook>(BOOKS[0]);
  const [chapter,setChapter]=useState(1);
  const [passage,setPassage]=useState<Passage|null>(null);
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState("");
  const [filter,setFilter]=useState("");
  const [testament,setTestament]=useState<"all"|"old_testament"|"new_testament">("all");
  const [query,setQuery]=useState("");
  const [results,setResults]=useState<{reference:string;passage?:Passage}[]>([]);
  const [bookmarks,setBookmarks]=useState<SavedReference[]>([]);
  const [history,setHistory]=useState<SavedReference[]>([]);
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [fontSize,setFontSize]=useState(18);
  const [noteText,setNoteText]=useState("");
  const [showNote,setShowNote]=useState(false);
  const [daily,setDaily]=useState<Passage|null>(null);
  const [drawer,setDrawer]=useState(false);
  const [picker,setPicker]=useState(false);
  const [pickerTab,setPickerTab]=useState<PickerTab>("BOOK");
  const [speaking,setSpeaking]=useState(false);
  const [speechVerse,setSpeechVerse]=useState(0);

  useEffect(()=>{
    (async()=>{
      const [id,bm,hist,n,fz]=await Promise.all([storage.getBibleId(),storage.getBookmarks(),storage.getHistory(),storage.getNotes(),storage.getFontSize()]);
      setBookmarks(bm);setHistory(hist);setNotes(n);setFontSize(fz || 18);
      if(id){setBibleId(id);} else { try { const available=await getHindiBibles(); const preferred=available[0]; if(preferred?.id){setBibleId(preferred.id);await storage.setBibleId(preferred.id);} else {setError('हिंदी बाइबल अनुवाद अभी उपलब्ध नहीं है। इंटरनेट कनेक्शन जाँचें।');} } catch(e) {setError(e instanceof Error?e.message:'हिंदी बाइबल लोड नहीं हुई।');} }
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
    setBook(nextBook);setChapter(nextChapter);setTab("bible");setDrawer(false);setPicker(false);setPassage(null);setError("");setShowNote(false);setNoteText(notes[`${nextBook.id}.${nextChapter}`]||"");
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
    if(!query.trim())return;
    setLoading(true);setError("");setResults([]);
    try{
      const refs=await searchVerses("",bibleId,query.trim());
      const mapped=await Promise.all(refs.map(async item=>{let text:Passage|undefined;try{text=await getPassage("",bibleId,item.reference||item.passage_id||"");}catch{}return {reference:item.reference||item.passage_id||"",passage:text};}));
      setResults(mapped);
    }catch(e){setError(e instanceof Error?e.message:"खोज पूरी नहीं हुई।");}
    finally{setLoading(false);}
  }
  async function saveSettings(){await storage.setBibleId(bibleId);Alert.alert("सेटिंग सेव हुई","अब बाइबल पढ़ना शुरू कर सकते हैं।");}
  function openReference(ref:string){const p=ref.split(".");const target=BOOKS.find(x=>x.id===p[0]);if(target)openChapter(target,Number(p[1])||1);}
  function changeTab(next:Tab){stopSpeech();setTab(next);setError("");setDrawer(false);setPicker(false);}
  function openPicker(which:PickerTab="BOOK"){setPickerTab(which);setPicker(true);}
  const currentSaved=bookmarks.some(x=>x.id===`${book.id}.${chapter}`);
  const chapterNumbers=Array.from({length:chapterCount},(_,i)=>i+1);
  const verseNumbers=verseList.map(v=>v.number).filter(Boolean);

  return <SafeAreaView style={s.safe}>
    <StatusBar barStyle="dark-content" backgroundColor={C.pale}/>
    <View style={s.topbar}>
      <Text style={s.brandMark}>✦</Text><Text style={s.brandName}>पवित्र बाइबल</Text>
      <Pressable onPress={()=>changeTab("settings")} style={s.topIcon}><Text style={s.topIconText}>⚙</Text></Pressable>
    </View>
    <ScrollView style={s.body} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {tab==="home"&&<>
        <Text style={s.homeIntro}>पवित्र बाइबल</Text>
        <Text style={s.homeSubIntro}>परमेश्वर के वचन को पढ़ें और सुनें</Text>
        <View style={s.featureGrid}>
          <Pressable style={[s.featureCard,s.primaryFeature]} onPress={()=>openChapter(BOOKS[0],1)}>
            <Text style={s.featureIcon}>📖</Text><Text style={s.featureLabel}>पवित्र बाइबल पढ़ें</Text><Text style={s.featureHint}>उत्पत्ति 1 से शुरू करें</Text>
          </Pressable>
          {[
            ["🎧","ऑडियो बाइबल"],["🔎","वचन खोजें"],["☆","बुकमार्क"],["🗓","पढ़ने की योजना"],["📝","नोट्स"],["💬","बाइबल अध्ययन"]
          ].map(([icon,label])=><View key={label} style={s.featureCard}><Text style={s.featureIcon}>{icon}</Text><Text style={s.featureLabel}>{label}</Text><Text style={s.comingSoon}>COMING SOON</Text></View>)}
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
          {verseList.map((v,i)=><Pressable key={v.number||i} onPress={()=>speaking?stopSpeech():speakFrom(i)} style={[s.verseRow,speaking&&speechVerse===i&&s.verseActive]}>
            {v.number>0&&<Text style={s.verseNumber}>{v.number}</Text>}
            <Text style={[s.verseText,{fontSize,lineHeight:fontSize*1.55}]}>{v.text}</Text>
          </Pressable>)}
          <Text style={s.copyright}>{passage.reference} • {passage.copyright||"अनुवाद का लाइसेंस और श्रेय Settings में देखें।"}</Text>
        </View>}
        <View style={s.chapterFooter}>
          <Button label="← पिछला अध्याय" outline onPress={()=>openChapter(book,Math.max(1,chapter-1))}/>
          <Button label="अगला अध्याय →" onPress={()=>openChapter(book,Math.min(chapterCount,chapter+1))}/>
        </View>
        <View style={s.readerActions}><Text style={s.sectionTitle}>पढ़ने की सुविधा</Text><View style={s.inlineActions}><Button label="A−" outline onPress={()=>{const n=Math.max(16,fontSize-1);setFontSize(n);storage.setFontSize(n);}}/><Button label="A+" outline onPress={()=>{const n=Math.min(32,fontSize+1);setFontSize(n);storage.setFontSize(n);}}/><Button label="नोट लिखें" onPress={()=>setShowNote(x=>!x)}/></View></View>
        {showNote&&<View style={s.noteCard}><TextInput value={noteText} onChangeText={setNoteText} multiline placeholder="इस अध्याय पर अपने विचार लिखें..." placeholderTextColor={C.muted} style={s.noteInput}/><Button label="नोट सेव करें" onPress={async()=>{const n={...notes,[`${book.id}.${chapter}`]:noteText};setNotes(n);await storage.setNotes(n);Alert.alert("सेव हो गया","आपका नोट इस डिवाइस पर सेव है।");}}/></View>}
      </>}

      {tab==="search"&&<>
        <Text style={s.pageHeading}>वचन खोजें</Text><Text style={s.muted}>किसी पुस्तक, अध्याय और वचन का Reference खोजें।</Text>
        <TextInput value={query} onChangeText={setQuery} onSubmitEditing={runSearch} placeholder="उदाहरण: यूहन्ना 3:16 या GEN.1.1" placeholderTextColor={C.muted} style={s.searchInput}/>
        <Button label="खोजें" onPress={runSearch}/>
        {loading&&<ActivityIndicator color={C.blue} style={{margin:20}}/>}{!!error&&<Text style={s.error}>{error}</Text>}
        {results.map((r,i)=><Pressable key={r.reference+i} style={s.resultCard} onPress={()=>openReference(r.reference)}><Text style={s.dailyRef}>{r.reference}</Text><Text style={s.resultText}>{r.passage?.content||"वचन खोलें"}</Text></Pressable>)}
      </>}

      {tab==="saved"&&<>
        <Text style={s.pageHeading}>सेव किए गए वचन</Text><Text style={s.sectionTitle}>बुकमार्क ({bookmarks.length})</Text>
        {bookmarks.map(x=><Pressable key={x.id} style={s.savedRow} onPress={()=>openChapter(BOOKS.find(b=>b.id===x.bookId)||BOOKS[0],x.chapter)}><Text style={s.cardTitle}>☆ {x.reference}</Text><Text style={s.muted}>अध्याय खोलें →</Text></Pressable>)}
        {!bookmarks.length&&<Text style={s.emptyBox}>अभी कोई बुकमार्क सेव नहीं है।</Text>}
        <Text style={s.sectionTitle}>हाल ही में पढ़े ({history.length})</Text>
        {history.map(x=><Pressable key={x.id} style={s.savedRow} onPress={()=>openChapter(BOOKS.find(b=>b.id===x.bookId)||BOOKS[0],x.chapter)}><Text style={s.cardTitle}>{x.reference}</Text><Text style={s.muted}>फिर से पढ़ें →</Text></Pressable>)}
      </>}

      {tab==="settings"&&<>
        <Text style={s.pageHeading}>सेटिंग्स</Text><Text style={s.muted}>हिंदी अनुवाद अपने आप चुना जाता है। यहाँ आवाज़ और पढ़ने का आकार बदलें।</Text>
        <View style={s.settingsCard}><Text style={s.sectionTitle}>आवाज़ और पढ़ना</Text><Text style={s.muted}>वचन सुनाने के लिए Android की Hindi Text-to-Speech आवाज़ का उपयोग होगा। यदि आवाज़ न आए तो फोन की Text-to-Speech सेटिंग में Hindi voice डाउनलोड करें।</Text><View style={s.inlineActions}><Button label="आवाज़ जाँचें" onPress={()=>Speech.speak("आदि में परमेश्वर ने आकाश और पृथ्वी की सृष्टि की।",{language:"hi-IN",rate:.88})}/><Button label="आवाज़ रोकें" outline onPress={stopSpeech}/></View><Text style={s.muted}>अक्षर आकार: {fontSize}</Text><View style={s.inlineActions}><Button label="A−" outline onPress={()=>{const n=Math.max(16,fontSize-1);setFontSize(n);storage.setFontSize(n);}}/><Button label="A+" outline onPress={()=>{const n=Math.min(32,fontSize+1);setFontSize(n);storage.setFontSize(n);}}/></View></View>
        {loading&&<ActivityIndicator color={C.blue} style={{margin:16}}/>}
      </>}
    </ScrollView>

    <View style={s.tabbar}>
      {([{id:"home",icon:"⌂",label:"होम"},{id:"bible",icon:"▤",label:"बाइबल"},{id:"search",icon:"⌕",label:"खोजें"},{id:"saved",icon:"☆",label:"सेव"},{id:"settings",icon:"⚙",label:"सेटिंग"}] as {id:Tab;icon:string;label:string}[]).map(x=><Pressable key={x.id} onPress={()=>changeTab(x.id)} style={s.tab}><Text style={[s.tabIcon,tab===x.id&&s.tabIconActive]}>{x.icon}</Text><Text style={[s.tabLabel,tab===x.id&&s.tabLabelActive]}>{x.label}</Text></Pressable>)}
    </View>

    <Modal visible={drawer} transparent animationType="slide" onRequestClose={()=>setDrawer(false)}>
      <View style={s.modalShade}><View style={s.drawer}>
        <View style={s.drawerHead}><Text style={s.drawerTitle}>Select the Book</Text><Pressable onPress={()=>setDrawer(false)}><Text style={s.closeText}>✕</Text></Pressable></View>
        <TextInput value={filter} onChangeText={setFilter} placeholder="पुस्तक खोजें" placeholderTextColor="#718096" style={s.drawerSearch}/>
        <ScrollView>{filteredBooks.map((b,i)=><Pressable key={b.id} onPress={()=>selectBook(b)} style={[s.drawerItem,b.id===book.id&&s.drawerItemActive]}><Text style={[s.drawerItemText,b.id===book.id&&{color:C.blue,fontWeight:"800"}]}>{i+1}. {b.hindi}</Text><Text style={s.drawerCount}>{b.chapters} अध्याय</Text></Pressable>)}</ScrollView>
      </View></View>
    </Modal>

    <Modal visible={picker} transparent animationType="fade" onRequestClose={()=>setPicker(false)}>
      <View style={s.modalShade}><View style={s.pickerPanel}>
        <View style={s.pickerHead}><Pressable onPress={()=>setPicker(false)}><Text style={s.closeText}>‹</Text></Pressable><Text style={s.pickerTitle}>{book.hindi} {chapter}</Text><Pressable onPress={()=>setPicker(false)}><Text style={s.cancelText}>Cancel</Text></Pressable></View>
        <View style={s.pickerTabs}>{(["BOOK","CHAPTER","VERSE"] as PickerTab[]).map(t=><Pressable key={t} onPress={()=>setPickerTab(t)} style={[s.pickerTab,pickerTab===t&&s.pickerTabActive]}><Text style={[s.pickerTabText,pickerTab===t&&{color:C.ink}]}>{t}</Text></Pressable>)}</View>
        {pickerTab==="BOOK"&&<ScrollView><View style={s.pickerBookList}>{BOOKS.map((b,i)=><Pressable key={b.id} onPress={()=>selectBook(b)} style={s.pickerBookItem}><Text style={s.pickerBookText}>{i+1}. {b.hindi}</Text><Text style={s.drawerCount}>{b.chapters} अध्याय</Text></Pressable>)}</View></ScrollView>}
        {pickerTab==="CHAPTER"&&<ScrollView contentContainerStyle={s.pickerGrid}>{chapterNumbers.map(n=><Pressable key={n} onPress={()=>openChapter(book,n)} style={[s.pickerNumber,n===chapter&&s.pickerNumberActive]}><Text style={[s.pickerNumberText,n===chapter&&{color:C.white}]}>{n}</Text></Pressable>)}</ScrollView>}
        {pickerTab==="VERSE"&&<ScrollView contentContainerStyle={s.pickerGrid}>{(verseNumbers.length?verseNumbers:Array.from({length:31},(_,i)=>i+1)).map(n=><Pressable key={n} onPress={()=>{setPicker(false);if(passage){setSpeechVerse(Math.max(0,verseList.findIndex(v=>v.number===n)));}}} style={[s.pickerNumber,n===speechVerse+1&&s.pickerNumberActive]}><Text style={[s.pickerNumberText,n===speechVerse+1&&{color:C.white}]}>{n}</Text></Pressable>)}</ScrollView>}
      </View></View>
    </Modal>
  </SafeAreaView>;
}

const s=StyleSheet.create({
 safe:{flex:1,backgroundColor:C.bg},topbar:{height:58,backgroundColor:C.pale,paddingHorizontal:17,flexDirection:"row",alignItems:"center",borderBottomWidth:1,borderBottomColor:"#C2DDF8"},brandMark:{fontSize:27,color:C.blue,marginRight:9},brandName:{fontSize:19,fontWeight:"900",color:C.ink,letterSpacing:.5},topIcon:{marginLeft:"auto",padding:8},topIconText:{fontSize:23,color:C.blue},body:{flex:1},content:{padding:17,paddingBottom:28},homeIntro:{fontSize:27,fontWeight:"900",color:C.ink,marginTop:6},homeSubIntro:{fontSize:14,color:C.muted,marginTop:5,marginBottom:18},comingSoon:{fontSize:9,fontWeight:"900",letterSpacing:.8,color:C.blue,marginTop:8},featureHint:{fontSize:11,color:"#DDEBFF",marginTop:5,fontWeight:"700"},primaryFeature:{width:"100%",minHeight:142,backgroundColor:"#0E6256",borderColor:"#0E6256"},homeHero:{backgroundColor:"#0E6256",borderRadius:22,padding:22,marginBottom:23},homeEyebrow:{color:"#D8C18C",fontSize:10,fontWeight:"900",letterSpacing:2},homeTitle:{color:"#FFFFFF",fontSize:27,fontWeight:"900",lineHeight:36,marginTop:12},homeSub:{color:"#D6E9E3",fontSize:14,lineHeight:22,marginTop:8,marginBottom:18},button:{backgroundColor:C.blue,borderRadius:10,paddingVertical:13,paddingHorizontal:14,alignItems:"center",justifyContent:"center",flex:1,marginTop:9},buttonOutline:{backgroundColor:C.white,borderWidth:1,borderColor:C.blue},buttonText:{color:C.white,fontSize:13,fontWeight:"800"},dailyHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},sectionTitle:{fontSize:19,fontWeight:"900",color:C.ink,marginTop:21,marginBottom:12},kicker:{fontSize:10,color:C.blue,fontWeight:"900",letterSpacing:1.1},dailyCard:{backgroundColor:C.white,borderRadius:17,padding:18,borderWidth:1,borderColor:C.line,marginBottom:8},dailyRef:{fontSize:16,fontWeight:"900",color:C.blue},dailyText:{fontSize:17,lineHeight:28,color:C.ink,marginTop:9},dailyFoot:{fontSize:12,color:C.blue,fontWeight:"800",marginTop:13},resumeCard:{backgroundColor:C.white,borderRadius:16,padding:17,flexDirection:"row",alignItems:"center",borderWidth:1,borderColor:C.line},cardTitle:{fontSize:16,fontWeight:"900",color:C.ink},muted:{fontSize:12,color:C.muted,lineHeight:19,marginTop:5},cardArrow:{fontSize:26,color:C.blue,marginLeft:10},twoCards:{flexDirection:"row",gap:12},testamentCard:{flex:1,backgroundColor:C.pale,borderRadius:15,padding:16,minHeight:120,borderWidth:1,borderColor:"#BEDAF7"},cardEmoji:{fontSize:26,marginBottom:9},featureGrid:{flexDirection:"row",flexWrap:"wrap",gap:10},featureCard:{width:"31.5%",minHeight:100,backgroundColor:C.white,borderRadius:14,alignItems:"center",justifyContent:"center",padding:10,borderWidth:1,borderColor:C.line},featureIcon:{fontSize:28,color:C.ink},featureLabel:{fontSize:12,fontWeight:"800",color:C.ink,marginTop:9,textAlign:"center"},readerHeader:{backgroundColor:C.pale,marginHorizontal:-17,marginTop:-17,paddingHorizontal:10,paddingVertical:9,flexDirection:"row",alignItems:"center",gap:4,borderBottomWidth:1,borderColor:"#C6DDF5"},headerAction:{width:37,height:42,alignItems:"center",justifyContent:"center"},headerActionText:{fontSize:23,color:C.blue,fontWeight:"700"},bookChapter:{flex:1,alignItems:"center",paddingVertical:9,borderWidth:1,borderColor:C.blue,borderRadius:5},bookChapterText:{fontSize:16,color:C.blue,fontWeight:"800"},chapterStrip:{marginHorizontal:-17,backgroundColor:C.white,maxHeight:67,borderBottomWidth:1,borderColor:C.line},chapterStripContent:{paddingHorizontal:12,alignItems:"center",gap:10},chapterPill:{width:45,height:45,borderRadius:23,borderWidth:1.5,borderColor:"#263443",alignItems:"center",justifyContent:"center",marginVertical:9},chapterPillActive:{backgroundColor:C.blue,borderColor:C.blue},chapterPillText:{fontSize:18,color:C.ink},chapterPillTextActive:{color:C.white},readerActions:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",marginTop:15},readerTitle:{fontSize:22,fontWeight:"900",color:C.ink},inlineActions:{flexDirection:"row",gap:9,alignItems:"center"},inlineActionText:{color:C.blue,fontSize:12,fontWeight:"900"},verseList:{backgroundColor:C.white,paddingHorizontal:14,paddingVertical:8,borderRadius:13,marginTop:12,borderWidth:1,borderColor:C.line},verseRow:{flexDirection:"row",alignItems:"flex-start",paddingVertical:13,borderBottomWidth:1,borderBottomColor:"#EDF1F5",gap:10},verseActive:{backgroundColor:"#E7F2FF",borderRadius:8,paddingHorizontal:7},verseNumber:{fontSize:16,color:C.blue,fontWeight:"900",minWidth:20,marginTop:3},verseText:{flex:1,color:"#141A21",fontSize:18,lineHeight:28},copyright:{fontSize:10,color:C.muted,lineHeight:16,paddingVertical:12},chapterFooter:{flexDirection:"row",gap:10,marginTop:10},emptyBox:{backgroundColor:C.white,padding:20,borderRadius:14,marginTop:16,borderWidth:1,borderColor:C.line},emptyTitle:{fontSize:18,fontWeight:"900",color:C.ink},error:{color:C.red,backgroundColor:"#FCEBEC",padding:13,borderRadius:10,marginTop:12,lineHeight:20},pageHeading:{fontSize:27,fontWeight:"900",color:C.ink,marginTop:9,marginBottom:8},searchInput:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:12,padding:14,color:C.ink,fontSize:15,marginTop:17,marginBottom:8},resultCard:{backgroundColor:C.white,borderWidth:1,borderColor:C.line,borderRadius:13,padding:15,marginTop:12},resultText:{fontSize:15,color:C.ink,lineHeight:24,marginTop:8},savedRow:{backgroundColor:C.white,borderRadius:13,padding:15,marginBottom:9,borderWidth:1,borderColor:C.line},settingsCard:{backgroundColor:C.white,borderRadius:16,padding:16,borderWidth:1,borderColor:C.line,marginTop:16},versionRow:{backgroundColor:"#F4F8FC",padding:13,borderRadius:11,marginTop:9,borderWidth:1,borderColor:C.line},versionSelected:{borderColor:C.blue,borderWidth:2},linkText:{fontSize:11,color:C.blue,marginTop:8},noteCard:{backgroundColor:C.white,borderRadius:14,padding:14,marginTop:12},noteInput:{minHeight:90,color:C.ink,textAlignVertical:"top",padding:10},tabbar:{height:67,backgroundColor:C.white,borderTopWidth:1,borderTopColor:C.line,flexDirection:"row",alignItems:"center",justifyContent:"space-around"},tab:{flex:1,alignItems:"center",justifyContent:"center"},tabIcon:{fontSize:22,color:C.muted},tabIconActive:{color:C.blue},tabLabel:{fontSize:10,color:C.muted,marginTop:3,fontWeight:"700"},tabLabelActive:{color:C.blue},modalShade:{flex:1,backgroundColor:"rgba(0,0,0,.48)",flexDirection:"row"},scrim:{flex:1},drawer:{width:"84%",maxWidth:390,backgroundColor:C.white},drawerHead:{height:58,backgroundColor:"#1684F5",paddingHorizontal:16,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},drawerTitle:{color:C.white,fontSize:19,fontWeight:"900"},closeText:{fontSize:25,color:C.blue,fontWeight:"700"},drawerSearch:{margin:12,padding:12,borderRadius:8,borderWidth:1,borderColor:C.line,color:C.ink},drawerItem:{paddingHorizontal:17,paddingVertical:15,borderBottomWidth:1,borderBottomColor:"#E3E7EC",flexDirection:"row",justifyContent:"space-between",alignItems:"center"},drawerItemActive:{backgroundColor:"#E8F3FF"},drawerItemText:{fontSize:16,color:C.ink},drawerCount:{fontSize:11,color:C.muted},pickerPanel:{backgroundColor:C.white,width:"100%",maxHeight:"88%",marginTop:"auto",borderTopLeftRadius:18,borderTopRightRadius:18,overflow:"hidden"},pickerHead:{height:58,backgroundColor:C.pale,paddingHorizontal:15,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},pickerTitle:{fontSize:19,color:C.blue,fontWeight:"800"},cancelText:{fontSize:15,color:C.blue,fontWeight:"700"},pickerTabs:{height:48,backgroundColor:"#1684F5",flexDirection:"row"},pickerTab:{flex:1,alignItems:"center",justifyContent:"center",borderBottomWidth:3,borderBottomColor:"transparent"},pickerTabActive:{borderBottomColor:"#16A05A"},pickerTabText:{fontSize:13,color:"#063B70",fontWeight:"800"},pickerBookList:{paddingBottom:20},pickerBookItem:{paddingHorizontal:18,paddingVertical:14,borderBottomWidth:1,borderBottomColor:"#D5D5D5",flexDirection:"row",justifyContent:"space-between"},pickerBookText:{fontSize:17,color:C.ink},pickerGrid:{flexDirection:"row",flexWrap:"wrap",justifyContent:"space-around",padding:10},pickerNumber:{width:"18%",height:64,alignItems:"center",justifyContent:"center",marginVertical:4,borderRadius:32},pickerNumberActive:{backgroundColor:"#328FE5"},pickerNumberText:{fontSize:19,color:C.ink}
});
