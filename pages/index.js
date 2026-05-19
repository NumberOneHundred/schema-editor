import { useState, useEffect, useRef, useMemo } from "react";
import { db, ref, set, get, onValue, remove } from "../lib/firebase";
import { parseSections, parseBlocks, blocksToText, sectionsToFull, inlineDiff, calcChangePercent } from "../lib/parsers";
import Head from "next/head";

const P = {bg:"#0B0B0F",s:"#14141E",s2:"#1A1A28",s3:"#20202E",b:"#2A2A3C",ba:"#6C6CFF",t:"#E2E2F0",m:"#8080A0",d:"#4A4A64",a:"#6C6CFF",as:"rgba(108,108,255,.1)",g:"#3DD68C",gs:"rgba(61,214,140,.1)",o:"#FFB347",os:"rgba(255,179,71,.1)",r:"#FF6B6B",rs:"rgba(255,107,107,.08)",bl:"#47B3FF",bls:"rgba(71,179,255,.1)",pk:"#FF6EB4",pks:"rgba(255,110,180,.08)",y:"#FFD93D",ys:"rgba(255,217,61,.1)"};
const BLS={info:{bg:P.bls,c:P.bl,l:"📘 info"},action:{bg:P.os,c:P.o,l:"🎯 action"},solution:{bg:P.gs,c:P.g,l:"💡 solution"},answer:{bg:P.as,c:P.a,l:"✅ answer"},mistake_explanation:{bg:P.rs,c:P.r,l:"⚠️ mistake"},problem:{bg:P.pks,c:P.pk,l:"🏆 problem"}};
const STS={unassigned:{l:"Не назначена",c:P.d,bg:"transparent"},editing:{l:"Редактура",c:P.o,bg:P.os},review:{l:"На ревью",c:P.bl,bg:P.bls},approved:{l:"Принято",c:P.g,bg:P.gs},rejected:{l:"Доработка",c:P.r,bg:P.rs}};

function emailToKey(e){return e.replace(/[.#$/[\]@]/g,"_");}
function saveSchema(s){set(ref(db,"schemas/"+emailToKey(s.id)),{id:s.id,title:s.title||"",original:s.original||"",sections:s.sections||{},editedSections:s.editedSections||null,editor:s.editor||null,status:s.status||"unassigned",comments:s.comments||{}});}

/* KaTeX */
function MathText({children,style}){
  const r=useRef(null);const[ok,setOk]=useState(false);
  useEffect(()=>{if(typeof window==="undefined")return;if(window.katex){setOk(true);return;}
    const l=document.createElement("link");l.rel="stylesheet";l.href="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css";document.head.appendChild(l);
    const s=document.createElement("script");s.src="https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js";s.onload=()=>setOk(true);document.head.appendChild(s);
  },[]);
  useEffect(()=>{if(!r.current||!ok||!window.katex)return;let t=String(children||"").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    try{t=t.replace(/\$\$([^$]+)\$\$/g,(m,f)=>{try{return window.katex.renderToString(f,{displayMode:true,throwOnError:false});}catch(e){return m;}});
    t=t.replace(/\$([^$\n]+)\$/g,(m,f)=>{try{return window.katex.renderToString(f,{displayMode:false,throwOnError:false});}catch(e){return m;}});}catch(e){}
    r.current.innerHTML=t.replace(/\n/g,"<br/>");
  },[children,ok]);
  if(!ok)return<pre style={style}>{children}</pre>;return<div ref={r} style={style}/>;
}

function Badge({status}){const s=STS[status]||STS.unassigned;return<span style={{display:"inline-flex",alignItems:"center",gap:4,padding:"3px 9px",borderRadius:14,fontSize:10,fontWeight:600,background:s.bg,color:s.c,border:"1px solid "+s.c+"30"}}><span style={{width:5,height:5,borderRadius:"50%",background:s.c}}/>{s.l}</span>;}
function STab({label,active,onClick,count}){return<button onClick={onClick} style={{padding:"6px 13px",borderRadius:7,border:"1px solid "+(active?P.ba:P.b),background:active?P.as:"transparent",color:active?P.a:P.m,fontSize:12,fontWeight:active?600:400,cursor:"pointer",display:"flex",alignItems:"center",gap:5}}>{label}{count!=null&&<span style={{fontSize:9,background:active?P.a:P.d,color:"#fff",borderRadius:8,padding:"1px 5px"}}>{count}</span>}</button>;}

function ChangeBadge({pct}){
  if(pct===0)return<span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:P.gs,color:P.g}}>без изменений</span>;
  if(pct<20)return<span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:P.gs,color:P.g}}>мало правок ({pct}%)</span>;
  if(pct<50)return<span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:P.os,color:P.o}}>средне ({pct}%)</span>;
  return<span style={{fontSize:9,padding:"2px 8px",borderRadius:10,background:P.rs,color:P.r}}>сильно изменено ({pct}%)</span>;
}

/* Editable line */
function EditableLine({text,onSave,color,bg}){
  const[ed,setEd]=useState(false);const[val,setVal]=useState(text);
  useEffect(()=>setVal(text),[text]);
  if(ed)return(<div style={{margin:"2px 0"}}><input value={val} onChange={e=>setVal(e.target.value)} autoFocus style={{width:"100%",background:P.bg,color:P.t,border:"1px solid "+P.ba,borderRadius:4,padding:"4px 8px",fontSize:11,fontFamily:"'IBM Plex Mono',monospace",boxSizing:"border-box"}} onKeyDown={e=>{if(e.key==="Enter"){onSave(val);setEd(false);}if(e.key==="Escape"){setVal(text);setEd(false);}}}/><div style={{display:"flex",gap:4,marginTop:3}}><button onClick={()=>{onSave(val);setEd(false);}} style={{padding:"2px 8px",borderRadius:3,border:"none",background:P.a,color:"#fff",fontSize:9,cursor:"pointer"}}>OK</button><button onClick={()=>{setVal(text);setEd(false);}} style={{padding:"2px 8px",borderRadius:3,border:"1px solid "+P.b,background:"transparent",color:P.m,fontSize:9,cursor:"pointer"}}>✕</button></div></div>);
  return<div onClick={()=>setEd(true)} style={{fontSize:11,lineHeight:1.6,fontFamily:"'IBM Plex Mono',monospace",whiteSpace:"pre-wrap",wordBreak:"break-word",color,background:bg||"transparent",borderRadius:3,padding:"1px 4px",margin:"1px 0",cursor:"pointer"}} title="Кликни для редактирования">{text||" "}</div>;
}

/* Block card */
function BlockCard({block,onChange}){
  const st=BLS[block.type]||BLS.info;const[ed,setEd]=useState(false);const[val,setVal]=useState(block.content);const ta=useRef(null);
  useEffect(()=>setVal(block.content),[block.content]);
  useEffect(()=>{if(ed&&ta.current){ta.current.style.height="auto";ta.current.style.height=ta.current.scrollHeight+"px";}},[ed,val]);
  return(<div style={{background:st.bg,border:"1px solid "+st.c+"20",borderLeft:"3px solid "+st.c,borderRadius:9,padding:"9px 13px",marginBottom:5}}>
    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:5}}><span style={{fontSize:10,fontWeight:600,color:st.c}}>{st.l} #{block.num}</span>{!ed&&onChange&&<button onClick={()=>setEd(true)} style={{fontSize:9,padding:"2px 7px",borderRadius:4,border:"1px solid "+P.b,background:"transparent",color:P.m,cursor:"pointer"}}>✏️</button>}</div>
    {ed?(<div><textarea ref={ta} value={val} onChange={e=>setVal(e.target.value)} style={{width:"100%",background:P.bg,color:P.t,border:"1px solid "+P.ba,borderRadius:6,padding:9,fontSize:12,lineHeight:1.55,fontFamily:"'IBM Plex Mono',monospace",resize:"none",overflow:"hidden",boxSizing:"border-box"}}/><div style={{display:"flex",gap:5,marginTop:5}}><button onClick={()=>{onChange(val);setEd(false);}} style={{padding:"4px 12px",borderRadius:5,border:"none",background:P.a,color:"#fff",fontSize:10,fontWeight:600,cursor:"pointer"}}>Сохранить</button><button onClick={()=>{setVal(block.content);setEd(false);}} style={{padding:"4px 12px",borderRadius:5,border:"1px solid "+P.b,background:"transparent",color:P.m,fontSize:10,cursor:"pointer"}}>Отмена</button></div></div>
    ):(<MathText style={{margin:0,whiteSpace:"pre-wrap",wordBreak:"break-word",fontSize:12,lineHeight:1.55,color:P.t,fontFamily:"'IBM Plex Mono',monospace"}}>{block.content||"(пусто)"}</MathText>)}
  </div>);
}

function SectionEditor({text,onChange}){
  const[ed,setEd]=useState(false);const[val,setVal]=useState(text);const ta=useRef(null);
  useEffect(()=>setVal(text),[text]);useEffect(()=>{if(ed&&ta.current){ta.current.style.height="auto";ta.current.style.height=ta.current.scrollHeight+"px";}},[ed,val]);
  if(ed)return(<div style={{background:P.s,border:"1px solid "+P.b,borderRadius:9,padding:14}}><textarea ref={ta} value={val} onChange={e=>setVal(e.target.value)} style={{width:"100%",background:P.bg,color:P.t,border:"1px solid "+P.ba,borderRadius:6,padding:10,fontSize:12,lineHeight:1.55,fontFamily:"'IBM Plex Mono',monospace",resize:"none",overflow:"hidden",boxSizing:"border-box"}}/><div style={{display:"flex",gap:5,marginTop:6}}><button onClick={()=>{onChange(val);setEd(false);}} style={{padding:"4px 12px",borderRadius:5,border:"none",background:P.a,color:"#fff",fontSize:10,fontWeight:600,cursor:"pointer"}}>Сохранить</button><button onClick={()=>{setVal(text);setEd(false);}} style={{padding:"4px 12px",borderRadius:5,border:"1px solid "+P.b,background:"transparent",color:P.m,fontSize:10,cursor:"pointer"}}>Отмена</button></div></div>);
  return(<div style={{background:P.s,border:"1px solid "+P.b,borderRadius:9,padding:14}}>{onChange&&<div style={{display:"flex",justifyContent:"flex-end",marginBottom:6}}><button onClick={()=>setEd(true)} style={{fontSize:9,padding:"2px 8px",borderRadius:4,border:"1px solid "+P.b,background:"transparent",color:P.m,cursor:"pointer"}}>✏️</button></div>}<MathText style={{margin:0,whiteSpace:"pre-wrap",wordBreak:"break-word",fontSize:12,lineHeight:1.55,color:P.t,fontFamily:"'IBM Plex Mono',monospace"}}>{text||"(пусто)"}</MathText></div>);
}

/* Original viewer modal */
function OriginalModal({schema,section,onClose}){
  const origSec=parseSections(schema.original);const t=origSec[section]||"";
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:P.s,border:"1px solid "+P.b,borderRadius:14,padding:24,width:700,maxHeight:"80vh",overflow:"auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",marginBottom:16}}><h2 style={{fontSize:16,fontWeight:700,color:P.t}}>Оригинал: {section}</h2><button onClick={onClose} style={{background:"transparent",border:"none",color:P.m,fontSize:16,cursor:"pointer"}}>✕</button></div>
      <MathText style={{whiteSpace:"pre-wrap",wordBreak:"break-word",fontSize:12,lineHeight:1.6,color:P.m,fontFamily:"'IBM Plex Mono',monospace"}}>{t||"(пусто)"}</MathText>
    </div></div>);
}

/* Diff block for reviewer */
function DiffBlock({origContent,editContent,blockType,blockNum,onEditLine,comment,onComment}){
  const st=BLS[blockType]||BLS.info;
  const diff=useMemo(()=>inlineDiff(origContent,editContent),[origContent,editContent]);
  const hasChanges=diff.some(d=>d.t!=="same");
  const[showCom,setShowCom]=useState(false);const[comVal,setComVal]=useState("");
  return(<div style={{background:st.bg,borderLeft:"3px solid "+(hasChanges?P.y:st.c+"40"),borderRadius:8,padding:"8px 12px",marginBottom:5}}>
    <div style={{display:"flex",gap:6,alignItems:"center",marginBottom:5}}>
      <span style={{fontSize:10,fontWeight:600,color:st.c}}>{st.l} #{blockNum}</span>
      {hasChanges&&<span style={{fontSize:8,padding:"1px 6px",borderRadius:3,background:P.ys,color:P.y,fontWeight:600}}>изменён</span>}
      {onComment&&<button onClick={()=>setShowCom(!showCom)} style={{marginLeft:"auto",fontSize:9,padding:"2px 7px",borderRadius:4,border:"1px solid "+P.b,background:comment?P.ys:"transparent",color:comment?P.y:P.m,cursor:"pointer"}}>💬</button>}
    </div>
    {diff.map((d,i)=>{
      if(d.t==="same")return<EditableLine key={i} text={d.text} color={P.m} bg="transparent" onSave={v=>{if(onEditLine)onEditLine(d.text,d.text,v);}}/>;
      if(d.t==="changed")return(<div key={i} style={{margin:"3px 0",padding:"4px 8px",borderRadius:5,background:"rgba(255,255,255,.03)",border:"1px solid "+P.b}}><MathText style={{fontSize:11,lineHeight:1.6,fontFamily:"'IBM Plex Mono',monospace",color:P.r,opacity:.6,marginBottom:3}}>{d.old}</MathText><EditableLine text={d.new_} color={P.g} bg={P.gs} onSave={v=>{if(onEditLine)onEditLine(d.old,d.new_,v);}}/></div>);
      if(d.t==="removed")return<EditableLine key={i} text={d.text} color={P.r} bg={P.rs} onSave={v=>{if(onEditLine)onEditLine(d.text,d.text,v);}}/>;
      if(d.t==="added")return<EditableLine key={i} text={d.text} color={P.g} bg={P.gs} onSave={v=>{if(onEditLine)onEditLine(null,d.text,v);}}/>;
      return null;
    })}
    {comment&&<div style={{marginTop:6,padding:"5px 10px",background:P.ys,border:"1px solid "+P.y+"30",borderRadius:6,fontSize:11,color:P.y}}>💬 {comment}</div>}
    {showCom&&onComment&&(<div style={{marginTop:6,display:"flex",gap:4}}><input value={comVal} onChange={e=>setComVal(e.target.value)} placeholder="Комментарий..." style={{flex:1,padding:"5px 8px",borderRadius:5,border:"1px solid "+P.b,background:P.bg,color:P.t,fontSize:11}} onKeyDown={e=>{if(e.key==="Enter"&&comVal.trim()){onComment(comVal.trim());setComVal("");setShowCom(false);}}}/><button onClick={()=>{if(comVal.trim()){onComment(comVal.trim());setComVal("");setShowCom(false);}}} style={{padding:"5px 10px",borderRadius:5,border:"none",background:P.y,color:"#000",fontSize:10,fontWeight:600,cursor:"pointer"}}>→</button></div>)}
  </div>);
}

/* ReviewDiffView */
function ReviewDiffView({schema,section,onUpdateEdited,onComment}){
  const origSec=parseSections(schema.original);const editSec=schema.editedSections||schema.sections;
  const oText=origSec[section]||"";const eText=editSec[section]||"";
  const isBlk=section==="ТЕОРИЯ"||section==="ФИНАЛЬНЫЙ БОСС";
  const changePct=useMemo(()=>calcChangePercent(oText,eText),[oText,eText]);

  function handleEditLine(secName,oldLine,currentLine,newLine){
    const curText=editSec[secName]||"";
    if(currentLine&&newLine!==currentLine)onUpdateEdited(secName,curText.replace(currentLine,newLine));
  }
  if(isBlk){
    const oBlocks=parseBlocks(oText);const eBlocks=parseBlocks(eText);const usedE={};
    const paired=oBlocks.map(ob=>{const key=ob.num+"-"+ob.type;let mi=-1;eBlocks.forEach((eb,idx)=>{if(!usedE[idx]&&eb.num+"-"+eb.type===key&&mi===-1)mi=idx;});if(mi!==-1){usedE[mi]=true;return{o:ob,e:eBlocks[mi]};}return{o:ob,e:null};});
    const added=eBlocks.filter((_,idx)=>!usedE[idx]);
    return(<div>
      <div style={{marginBottom:10}}><ChangeBadge pct={changePct}/></div>
      {paired.map((p,i)=>{const bk=section+"-"+p.o.num+"-"+p.o.type;return<DiffBlock key={i} origContent={p.o.content} editContent={p.e?p.e.content:""} blockType={p.o.type} blockNum={p.o.num} onEditLine={(oldL,curL,newL)=>handleEditLine(section,oldL,curL,newL)} comment={schema.comments?schema.comments[bk]:null} onComment={txt=>onComment(bk,txt)}/>;
      })}
      {added.map((eb,i)=>{const st=BLS[eb.type]||BLS.info;return(<div key={"a"+i} style={{background:P.gs,borderLeft:"3px solid "+P.g,borderRadius:8,padding:"8px 12px",marginBottom:5}}><span style={{fontSize:10,fontWeight:600,color:st.c}}>{st.l} #{eb.num}</span><span style={{fontSize:8,padding:"1px 6px",borderRadius:3,background:P.gs,color:P.g,fontWeight:600,marginLeft:6}}>новый</span><MathText style={{fontSize:11,lineHeight:1.6,fontFamily:"'IBM Plex Mono',monospace",whiteSpace:"pre-wrap",color:P.g,marginTop:4}}>{eb.content}</MathText></div>);})}
    </div>);
  }
  const diff=inlineDiff(oText,eText);
  return(<div><div style={{marginBottom:10}}><ChangeBadge pct={changePct}/></div><div style={{background:P.s,border:"1px solid "+P.b,borderRadius:9,padding:14}}>
    {diff.map((d,i)=>{
      if(d.t==="same")return<EditableLine key={i} text={d.text} color={P.m} bg="transparent" onSave={v=>onUpdateEdited(section,eText.replace(d.text,v))}/>;
      if(d.t==="changed")return(<div key={i} style={{margin:"3px 0",padding:"4px 8px",borderRadius:5,background:"rgba(255,255,255,.03)",border:"1px solid "+P.b}}><MathText style={{fontSize:11,fontFamily:"'IBM Plex Mono',monospace",color:P.r,opacity:.6,marginBottom:3}}>{d.old}</MathText><EditableLine text={d.new_} color={P.g} bg={P.gs} onSave={v=>onUpdateEdited(section,eText.replace(d.new_,v))}/></div>);
      if(d.t==="removed")return<EditableLine key={i} text={d.text} color={P.r} bg={P.rs} onSave={v=>onUpdateEdited(section,eText+"\n"+v)}/>;
      if(d.t==="added")return<EditableLine key={i} text={d.text} color={P.g} bg={P.gs} onSave={v=>onUpdateEdited(section,eText.replace(d.text,v))}/>;
      return null;
    })}</div></div>);
}

/* Import modal */
function ImportModal({onImport,onClose}){
  const[mode,setMode]=useState("file");const[text,setText]=useState("");const[sid,setSid]=useState("");const[tit,setTit]=useState("");const[fs,setFs]=useState(null);
  async function handleFile(e){const file=e.target.files[0];if(!file)return;const XLSX=await import("xlsx");const reader=new FileReader();
    reader.onload=ev=>{try{const wb=XLSX.read(ev.target.result,{type:"array"});const ws=wb.Sheets[wb.SheetNames[0]];const data=XLSX.utils.sheet_to_json(ws,{header:1});const header=data[0]||[];let tc=-1,ic=-1,ttc=-1;
      for(let r=1;r<Math.min(data.length,5);r++){const row=data[r];if(!row)continue;for(let c=0;c<row.length;c++){if(String(row[c]||"").includes("# ПЛАН")&&tc===-1)tc=c;}}
      header.forEach((h,i)=>{const hl=String(h||"").toLowerCase().trim();if((hl==="id"||hl==="id схемы")&&ic===-1)ic=i;if((hl==="тема"||hl==="название")&&ttc===-1)ttc=i;});
      if(tc===-1)tc=0;if(ic===-1)ic=5;if(ttc===-1)ttc=4;
      const schemas=[];for(let r=1;r<data.length;r++){const row=data[r];if(!row)continue;const raw=String(row[tc]||"");if(!raw.includes("ПЛАН")&&!raw.includes("ТЕОРИЯ"))continue;schemas.push({id:String(row[ic]||r),title:String(row[ttc]||"Схема"),raw});}
      setFs(schemas);}catch(err){alert("Ошибка: "+err.message);}};reader.readAsArrayBuffer(file);}
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:P.s,border:"1px solid "+P.b,borderRadius:14,padding:24,width:540,maxHeight:"80vh",overflow:"auto"}}>
      <h2 style={{fontSize:16,fontWeight:700,marginBottom:16,color:P.t}}>Импорт</h2>
      <div style={{display:"flex",gap:5,marginBottom:16}}><STab label="📁 Файл" active={mode==="file"} onClick={()=>setMode("file")}/><STab label="📋 Текст" active={mode==="text"} onClick={()=>setMode("text")}/></div>
      {mode==="text"?(<div><div style={{display:"flex",gap:6,marginBottom:8}}><input value={sid} onChange={e=>setSid(e.target.value)} placeholder="ID" style={{flex:1,padding:"7px 10px",borderRadius:6,border:"1px solid "+P.b,background:P.bg,color:P.t,fontSize:12}}/><input value={tit} onChange={e=>setTit(e.target.value)} placeholder="Тема" style={{flex:2,padding:"7px 10px",borderRadius:6,border:"1px solid "+P.b,background:P.bg,color:P.t,fontSize:12}}/></div>
        <textarea value={text} onChange={e=>setText(e.target.value)} placeholder="Текст схемы..." rows={10} style={{width:"100%",background:P.bg,color:P.t,border:"1px solid "+P.b,borderRadius:7,padding:10,fontSize:12,fontFamily:"'IBM Plex Mono',monospace",resize:"vertical",boxSizing:"border-box"}}/>
        <button onClick={()=>{if(text.includes("ПЛАН"))onImport([{id:sid||"new",title:tit||"Без названия",raw:text.trim()}]);}} style={{marginTop:10,padding:"8px 20px",borderRadius:7,border:"none",background:P.a,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Импортировать</button></div>
      ):(<div><label style={{display:"block",padding:"32px 16px",border:"2px dashed "+P.b,borderRadius:10,textAlign:"center",cursor:"pointer",color:P.m,fontSize:12}}>📂 Выбери .xlsx<input type="file" accept=".xlsx,.xls" onChange={handleFile} style={{display:"none"}}/></label>
        {fs&&<div style={{marginTop:10}}><div style={{fontSize:12,color:P.g,marginBottom:8}}>Найдено: {fs.length}</div><div style={{maxHeight:200,overflow:"auto"}}>{fs.map(s=><div key={s.id} style={{fontSize:11,color:P.m,padding:"3px 0",display:"flex",gap:6}}><span style={{color:P.d,fontWeight:600,minWidth:40}}>#{s.id}</span><span>{s.title}</span></div>)}</div><button onClick={()=>onImport(fs)} style={{marginTop:10,padding:"8px 20px",borderRadius:7,border:"none",background:P.a,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>Импортировать ({fs.length})</button></div>}</div>)}
    </div></div>);
}

/* Assign modal */
function AssignModal({schemas,editors,onAssign,onClose,reassign}){
  const targets=reassign?schemas:schemas.filter(s=>s.status==="unassigned"||!s.editor);
  const[sel,setSel]=useState(new Set(reassign?[]:targets.map(s=>s.id)));const[ed,setEd]=useState(editors[0]||"");const[ne,setNe]=useState("");const fe=ne.trim()||ed;
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:P.s,border:"1px solid "+P.b,borderRadius:14,padding:24,width:500,maxHeight:"80vh",overflow:"auto"}}>
      <h2 style={{fontSize:16,fontWeight:700,marginBottom:16,color:P.t}}>{reassign?"Переназначить":"Назначить"}</h2>
      <div style={{marginBottom:14}}><div style={{fontSize:11,color:P.d,marginBottom:6,fontWeight:600}}>Редактор:</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>{editors.map(e=>{const a=ed===e&&!ne;return<button key={e} onClick={()=>{setEd(e);setNe("");}} style={{padding:"5px 14px",borderRadius:6,border:"1px solid "+(a?P.ba:P.b),background:a?P.as:"transparent",color:a?P.a:P.m,fontSize:12,cursor:"pointer"}}>{e}</button>;})}</div>
        <input value={ne} onChange={e=>setNe(e.target.value)} placeholder="Или новый..." style={{width:"100%",padding:"7px 10px",borderRadius:6,border:"1px solid "+P.b,background:P.bg,color:P.t,fontSize:12,boxSizing:"border-box"}}/></div>
      <div style={{marginBottom:14}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}><span style={{fontSize:11,color:P.d,fontWeight:600}}>{sel.size}/{targets.length}</span><button onClick={()=>{sel.size===targets.length?setSel(new Set()):setSel(new Set(targets.map(s=>s.id)));}} style={{fontSize:10,color:P.a,background:"transparent",border:"none",cursor:"pointer"}}>{sel.size===targets.length?"Снять":"Все"}</button></div>
        <div style={{maxHeight:250,overflow:"auto"}}>{targets.map(s=><label key={s.id} style={{display:"flex",alignItems:"center",gap:8,padding:"4px 0",fontSize:12,color:P.t,cursor:"pointer"}}><input type="checkbox" checked={sel.has(s.id)} onChange={()=>{const n=new Set(sel);n.has(s.id)?n.delete(s.id):n.add(s.id);setSel(n);}}/><span style={{color:P.d,fontWeight:600}}>#{s.id}</span><span style={{flex:1}}>{s.title}</span>{s.editor&&<span style={{fontSize:9,color:P.d}}>{s.editor}</span>}</label>)}</div></div>
      <button onClick={()=>{if(fe&&sel.size)onAssign([...sel],fe);}} style={{padding:"8px 20px",borderRadius:7,border:"none",background:fe&&sel.size?P.a:P.d,color:"#fff",fontSize:12,fontWeight:600,cursor:fe&&sel.size?"pointer":"default"}}>{reassign?"Переназначить":"Назначить"} {sel.size}</button>
    </div></div>);
}

/* Users management modal */
function UsersModal({users,onAdd,onRemove,onClose}){
  const[email,setEmail]=useState("");const[name,setName]=useState("");const[role,setRole]=useState("editor");
  return(<div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.7)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000}} onClick={onClose}>
    <div onClick={e=>e.stopPropagation()} style={{background:P.s,border:"1px solid "+P.b,borderRadius:14,padding:24,width:500,maxHeight:"80vh",overflow:"auto"}}>
      <h2 style={{fontSize:16,fontWeight:700,marginBottom:16,color:P.t}}>👥 Сотрудники</h2>
      <div style={{marginBottom:16}}>
        {users.map(u=>(<div key={u.email} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"8px 12px",background:P.bg,border:"1px solid "+P.b,borderRadius:7,marginBottom:4}}>
          <div><div style={{fontSize:12,fontWeight:600,color:P.t}}>{u.name}</div><div style={{fontSize:10,color:P.d}}>{u.email} • {u.role}</div></div>
          <button onClick={()=>onRemove(u.email)} style={{fontSize:9,padding:"3px 8px",borderRadius:4,border:"1px solid "+P.r+"40",background:P.rs,color:P.r,cursor:"pointer"}}>Удалить</button>
        </div>))}
      </div>
      <div style={{borderTop:"1px solid "+P.b,paddingTop:16}}>
        <div style={{fontSize:11,color:P.d,marginBottom:8,fontWeight:600}}>Добавить сотрудника:</div>
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <input value={email} onChange={e=>setEmail(e.target.value)} placeholder="email" style={{flex:2,padding:"7px 10px",borderRadius:6,border:"1px solid "+P.b,background:P.bg,color:P.t,fontSize:12}}/>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="Имя" style={{flex:1,padding:"7px 10px",borderRadius:6,border:"1px solid "+P.b,background:P.bg,color:P.t,fontSize:12}}/>
        </div>
        <div style={{display:"flex",gap:6,marginBottom:10}}>
          {["editor","reviewer","manager"].map(r=>(<button key={r} onClick={()=>setRole(r)} style={{padding:"5px 14px",borderRadius:6,border:"1px solid "+(role===r?P.ba:P.b),background:role===r?P.as:"transparent",color:role===r?P.a:P.m,fontSize:11,cursor:"pointer"}}>{r==="editor"?"✏️ Редактор":r==="reviewer"?"👁 Ревьюер":"📊 Менеджер"}</button>))}
        </div>
        <button onClick={()=>{if(email.trim()&&name.trim()){onAdd({email:email.trim(),name:name.trim(),role});setEmail("");setName("");}}} style={{padding:"8px 20px",borderRadius:7,border:"none",background:email.trim()&&name.trim()?P.g:P.d,color:"#000",fontSize:12,fontWeight:600,cursor:email.trim()&&name.trim()?"pointer":"default"}}>+ Добавить</button>
      </div>
    </div></div>);
}

/* Login */
function LoginScreen({users,onLogin}){
  const[email,setEmail]=useState("");const[error,setError]=useState("");
  function tryLogin(){const u=users.find(u=>u.email.toLowerCase()===email.trim().toLowerCase());if(u){onLogin(u);}else{setError("Нет доступа. Обратитесь к менеджеру.");}}
  return(<div style={{minHeight:"100vh",background:P.bg,display:"flex",alignItems:"center",justifyContent:"center"}}>
    <div style={{background:P.s,border:"1px solid "+P.b,borderRadius:16,padding:32,width:380}}>
      <div style={{textAlign:"center",marginBottom:24}}><div style={{fontSize:24,fontWeight:800,marginBottom:4}}><span style={{color:P.a}}>◆</span> Schema Editor</div><div style={{fontSize:12,color:P.d}}>Введи корпоративный email</div></div>
      <input value={email} onChange={e=>{setEmail(e.target.value);setError("");}} placeholder="email@company.ru" style={{width:"100%",padding:"10px 14px",borderRadius:8,border:"1px solid "+P.b,background:P.bg,color:P.t,fontSize:14,boxSizing:"border-box",marginBottom:12}} onKeyDown={e=>{if(e.key==="Enter")tryLogin();}}/>
      {error&&<div style={{fontSize:11,color:P.r,marginBottom:10}}>{error}</div>}
      <button onClick={tryLogin} style={{width:"100%",padding:"10px",borderRadius:8,border:"none",background:email.trim()?P.a:P.d,color:"#fff",fontSize:13,fontWeight:700,cursor:email.trim()?"pointer":"default"}}>Войти</button>
    </div></div>);
}

/* Export */
async function exportXlsx(schemas){
  const XLSX=await import("xlsx");
  const rows=[["ID","Тема","Редактор","Статус","ПЛАН","ТЕОРИЯ","ФИНАЛЬНЫЙ БОСС","КОНСПЕКТ","Полный текст"]];
  schemas.forEach(s=>{const sec=s.editedSections||s.sections;rows.push([s.id,s.title,s.editor||"",(STS[s.status]||{}).l||"",sec["ПЛАН"]||"",sec["ТЕОРИЯ"]||"",sec["ФИНАЛЬНЫЙ БОСС"]||"",sec["КОНСПЕКТ"]||"",sectionsToFull(sec)]);});
  const ws=XLSX.utils.aoa_to_sheet(rows);const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,"Схемы");XLSX.writeFile(wb,"schemas_export.xlsx");
}

/* ═══ MAIN ═══ */
export default function Home(){
  const[user,setUser]=useState(null);
  const[users,setUsers]=useState([]);
  const[schemas,setSchemas]=useState([]);
  const[selId,setSelId]=useState(null);
  const[sec,setSec]=useState("ПЛАН");
  const[showImport,setShowImport]=useState(false);
  const[showAssign,setShowAssign]=useState(false);
  const[showUsers,setShowUsers]=useState(false);
  const[showOrig,setShowOrig]=useState(false);
  const[reassignMode,setReassignMode]=useState(false);
  const[filterEditor,setFilterEditor]=useState("all");
  const[loading,setLoading]=useState(true);

  useEffect(()=>{const u1=onValue(ref(db,"schemas"),snap=>{if(snap.val())setSchemas(Object.values(snap.val()));else setSchemas([]);setLoading(false);});
    const u2=onValue(ref(db,"users"),snap=>{if(snap.val())setUsers(Object.values(snap.val()));else setUsers([]);});
    return()=>{u1();u2();};},[]);

  const editors=useMemo(()=>[...new Set(schemas.map(s=>s.editor).filter(Boolean))],[schemas]);
  const mode=user?.role||"editor";
  const filtered=useMemo(()=>{let list=schemas;if(mode==="editor"&&user)list=list.filter(s=>s.editor===user.name);
    if(filterEditor==="all")return list;if(filterEditor==="__none")return list.filter(s=>!s.editor);return list.filter(s=>s.editor===filterEditor);},[schemas,filterEditor,mode,user]);
  const sel=schemas.find(s=>s.id===selId);
  const curSec=sel?(sel.editedSections||sel.sections):{};
  const secNames=["ПЛАН","ТЕОРИЯ","ФИНАЛЬНЫЙ БОСС","КОНСПЕКТ"].filter(k=>curSec[k]||(sel&&sel.sections[k]));
  const tB=parseBlocks(curSec["ТЕОРИЯ"]);const bB=parseBlocks(curSec["ФИНАЛЬНЫЙ БОСС"]);

  function handleImport(inc){inc.forEach(s=>{saveSchema({id:s.id,title:s.title,original:s.raw,sections:parseSections(s.raw),editedSections:null,editor:null,status:"unassigned",comments:{}});});setShowImport(false);}
  function handleAssign(ids,editor){ids.forEach(id=>{const s=schemas.find(x=>x.id===id);if(s)saveSchema({...s,editor,status:"editing",editedSections:s.editedSections||{...s.sections}});});setShowAssign(false);}
  function updateSection(sn,v){if(!sel)return;const es={...(sel.editedSections||sel.sections),[sn]:v};saveSchema({...sel,editedSections:es});}
  function updateBlock(sn,idx,v){if(!sel)return;const src=(sel.editedSections||sel.sections)[sn];const bs=parseBlocks(src);bs[idx]={...bs[idx],content:v};updateSection(sn,blocksToText(bs));}
  function setStatus(ns){if(!sel)return;saveSchema({...sel,status:ns});}
  function addComment(bk,txt){if(!sel)return;saveSchema({...sel,comments:{...(sel.comments||{}),[bk]:txt}});}
  function addUser(u){set(ref(db,"users/"+emailToKey(u.email)),u);}
  function removeUser(email){remove(ref(db,"users/"+emailToKey(email)));}

  if(!user)return(<><Head><title>Schema Editor</title></Head><LoginScreen users={users} onLogin={u=>setUser(u)}/></>);
  if(loading)return<div style={{minHeight:"100vh",background:P.bg,display:"flex",alignItems:"center",justifyContent:"center",color:P.m}}>Загрузка...</div>;

  return(<><Head><title>Schema Editor — {user.name}</title></Head>
    <div style={{minHeight:"100vh",background:P.bg,color:P.t,fontFamily:"'DM Sans',sans-serif"}}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap" rel="stylesheet"/>
      {showImport&&<ImportModal onImport={handleImport} onClose={()=>setShowImport(false)}/>}
      {showAssign&&<AssignModal schemas={schemas} editors={editors} onAssign={handleAssign} onClose={()=>setShowAssign(false)} reassign={reassignMode}/>}
      {showUsers&&<UsersModal users={users} onAdd={addUser} onRemove={removeUser} onClose={()=>setShowUsers(false)}/>}
      {showOrig&&sel&&<OriginalModal schema={sel} section={sec} onClose={()=>setShowOrig(false)}/>}

      {/* Header */}
      <div style={{borderBottom:"1px solid "+P.b,padding:"10px 18px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:100,background:P.bg+"ee"}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}><span style={{fontSize:16,fontWeight:800}}><span style={{color:P.a}}>◆</span> Schema Editor</span><span style={{fontSize:10,color:P.d,background:P.as,padding:"2px 8px",borderRadius:4}}>{user.name} • {mode==="manager"?"📊":mode==="editor"?"✏️":"👁"}</span></div>
        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          {mode==="manager"&&<button onClick={()=>setShowImport(true)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid "+P.g+"40",background:P.gs,color:P.g,fontSize:11,fontWeight:600,cursor:"pointer"}}>+ Импорт</button>}
          {mode==="manager"&&schemas.length>0&&<button onClick={()=>{setReassignMode(false);setShowAssign(true);}} style={{padding:"6px 14px",borderRadius:6,border:"1px solid "+P.o+"40",background:P.os,color:P.o,fontSize:11,fontWeight:600,cursor:"pointer"}}>👤</button>}
          {mode==="manager"&&schemas.length>0&&<button onClick={()=>{setReassignMode(true);setShowAssign(true);}} style={{padding:"6px 14px",borderRadius:6,border:"1px solid "+P.y+"40",background:P.ys,color:P.y,fontSize:11,fontWeight:600,cursor:"pointer"}}>🔄</button>}
          {mode==="manager"&&<button onClick={()=>setShowUsers(true)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid "+P.bl+"40",background:P.bls,color:P.bl,fontSize:11,fontWeight:600,cursor:"pointer"}}>👥</button>}
          {mode==="manager"&&schemas.length>0&&<button onClick={()=>exportXlsx(schemas)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid "+P.a+"40",background:P.as,color:P.a,fontSize:11,fontWeight:600,cursor:"pointer"}}>↓</button>}
          <button onClick={()=>setUser(null)} style={{padding:"6px 14px",borderRadius:6,border:"1px solid "+P.r+"40",background:P.rs,color:P.r,fontSize:11,fontWeight:600,cursor:"pointer"}}>Выйти</button>
        </div>
      </div>

      {schemas.length===0&&mode==="manager"?(
        <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",height:"calc(100vh - 50px)",gap:14}}><div style={{fontSize:44,opacity:.25}}>◇</div><div style={{fontSize:14,color:P.m}}>Пока нет схем</div><button onClick={()=>setShowImport(true)} style={{padding:"10px 24px",borderRadius:8,border:"none",background:P.a,color:"#fff",fontSize:13,fontWeight:700,cursor:"pointer"}}>Импортировать</button></div>
      ):mode==="manager"&&!selId?(
        <div style={{padding:20,maxWidth:860,margin:"0 auto"}}>
          <h2 style={{fontSize:18,fontWeight:800,marginBottom:16}}>Дашборд</h2>
          <div style={{display:"grid",gridTemplateColumns:"repeat(5,1fr)",gap:8,marginBottom:24}}>
            {["unassigned","editing","review","approved","rejected"].map(st=>{const c=schemas.filter(s=>s.status===st).length;const i=STS[st];return<div key={st} style={{background:i.bg,border:"1px solid "+i.c+"25",borderRadius:10,padding:"12px 14px",textAlign:"center"}}><div style={{fontSize:22,fontWeight:800,color:i.c}}>{c}</div><div style={{fontSize:10,color:i.c,marginTop:2}}>{i.l}</div></div>;})}
          </div>
          <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap"}}>
            <STab label="Все" active={filterEditor==="all"} onClick={()=>setFilterEditor("all")} count={schemas.length}/>{editors.map(e=><STab key={e} label={e} active={filterEditor===e} onClick={()=>setFilterEditor(e)} count={schemas.filter(s=>s.editor===e).length}/>)}<STab label="∅" active={filterEditor==="__none"} onClick={()=>setFilterEditor("__none")} count={schemas.filter(s=>!s.editor).length}/>
          </div>
          <div style={{display:"flex",flexDirection:"column",gap:4}}>
            {filtered.map(s=><div key={s.id} onClick={()=>{setSelId(s.id);setSec("ПЛАН");}} style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"9px 12px",background:P.s,border:"1px solid "+P.b,borderRadius:7,cursor:"pointer"}}><div style={{display:"flex",alignItems:"center",gap:8}}><span style={{fontSize:11,fontWeight:700,color:P.d,minWidth:36}}>#{s.id}</span><span style={{fontSize:12,fontWeight:500}}>{s.title}</span></div><div style={{display:"flex",gap:8,alignItems:"center"}}>{s.editor&&<span style={{fontSize:10,color:P.d,background:P.s3,padding:"2px 8px",borderRadius:4}}>{s.editor}</span>}<Badge status={s.status}/></div></div>)}
          </div>
        </div>
      ):(
        <div style={{display:"flex",height:"calc(100vh - 50px)"}}>
          <div style={{width:240,borderRight:"1px solid "+P.b,overflowY:"auto",padding:"12px 8px",flexShrink:0}}>
            {mode==="manager"&&<button onClick={()=>setSelId(null)} style={{width:"100%",padding:"6px",borderRadius:6,border:"1px solid "+P.b,background:"transparent",color:P.m,fontSize:11,cursor:"pointer",marginBottom:8}}>← Дашборд</button>}
            {mode!=="editor"&&editors.length>0&&<div style={{display:"flex",gap:3,marginBottom:10,flexWrap:"wrap",padding:"0 4px"}}>{["all",...editors].map(e=>{const a=filterEditor===e;return<button key={e} onClick={()=>setFilterEditor(e)} style={{fontSize:9,padding:"3px 8px",borderRadius:4,border:"1px solid "+(a?P.ba:P.b),background:a?P.as:"transparent",color:a?P.a:P.d,cursor:"pointer",fontWeight:600}}>{e==="all"?"Все":e}</button>;})}</div>}
            {filtered.map(s=>{const a=selId===s.id;return<div key={s.id} onClick={()=>{setSelId(s.id);setSec("ПЛАН");}} style={{padding:"8px 10px",borderRadius:7,cursor:"pointer",marginBottom:2,background:a?P.as:"transparent",border:"1px solid "+(a?P.ba:"transparent")}}><div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}><span style={{fontSize:10,fontWeight:700,color:a?P.a:P.d}}>#{s.id}</span><Badge status={s.status}/></div><div style={{fontSize:11,fontWeight:500,color:P.t,lineHeight:1.3}}>{s.title}</div>{s.editor&&<div style={{fontSize:9,color:P.d,marginTop:2}}>{s.editor}</div>}</div>;})}
          </div>
          <div style={{flex:1,overflowY:"auto",padding:18}}>
            {sel?(<div style={{maxWidth:920}}>
              <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12}}><span style={{fontSize:12,fontWeight:700,color:P.d}}>#{sel.id}</span><h2 style={{fontSize:16,fontWeight:800,margin:0}}>{sel.title}</h2><Badge status={sel.status}/>{sel.editor&&<span style={{fontSize:10,color:P.d,background:P.s3,padding:"2px 8px",borderRadius:4}}>{sel.editor}</span>}</div>
              <div style={{display:"flex",gap:5,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                {secNames.map(s=><STab key={s} label={s} active={sec===s} onClick={()=>setSec(s)} count={s==="ТЕОРИЯ"?tB.length:s==="ФИНАЛЬНЫЙ БОСС"?bB.length:undefined}/>)}
                <button onClick={()=>setShowOrig(true)} style={{padding:"6px 13px",borderRadius:7,border:"1px solid "+P.b,background:"transparent",color:P.d,fontSize:12,cursor:"pointer"}}>📋 Оригинал</button>
              </div>

              {mode==="reviewer"||mode==="manager"?(
                <div>
                  <ReviewDiffView schema={sel} section={sec} onUpdateEdited={(sn,v)=>updateSection(sn,v)} onComment={(bk,txt)=>addComment(bk,txt)}/>
                  <div style={{marginTop:16,display:"flex",gap:8}}>
                    <button onClick={()=>setStatus("approved")} style={{padding:"7px 18px",borderRadius:6,border:"none",background:P.g,color:"#000",fontWeight:700,fontSize:11,cursor:"pointer"}}>✓ Принять</button>
                    <button onClick={()=>setStatus("rejected")} style={{padding:"7px 18px",borderRadius:6,border:"1px solid "+P.r,background:"transparent",color:P.r,fontWeight:600,fontSize:11,cursor:"pointer"}}>✕ На доработку</button>
                  </div>
                </div>
              ):(sec==="ТЕОРИЯ"||sec==="ФИНАЛЬНЫЙ БОСС")?(
                <div>{(sec==="ТЕОРИЯ"?tB:bB).map((b,i)=><BlockCard key={b.num+"-"+b.type+"-"+i} block={b} onChange={v=>updateBlock(sec,i,v)}/>)}</div>
              ):(
                <SectionEditor text={curSec[sec]||""} onChange={v=>updateSection(sec,v)}/>
              )}

              {mode==="editor"&&sel.status==="editing"&&(<div style={{marginTop:16}}><button onClick={()=>setStatus("review")} style={{padding:"8px 20px",borderRadius:7,border:"none",background:P.a,color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>📤 На ревью</button></div>)}
            </div>):(<div style={{display:"flex",alignItems:"center",justifyContent:"center",height:"100%",color:P.d,fontSize:13}}>← Выбери схему</div>)}
          </div>
        </div>
      )}
    </div></>);
}
