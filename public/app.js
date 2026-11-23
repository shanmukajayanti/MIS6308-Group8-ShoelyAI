/* Shoely AI — front-end. Vanilla JS, no build step. */
const $=s=>document.querySelector(s);let META,page='dashboard',sel={},INV=[];const _h=location.hash.slice(1);
const ICONS={
dash:'<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
pulse:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',trend:'<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
file:'<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>',
truck:'<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
box:'<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
heart:'<path d="M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 0 0-7.1 7.1L12 21l8.8-8.3a5 5 0 0 0 0-7.1z"/>',
cog:'<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
search:'<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
sun:'<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
moon:'<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
spark:'<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z"/>',
send:'<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',x:'<path d="M18 6L6 18M6 6l12 12"/>',check:'<path d="M20 6L9 17l-5-5"/>',
alert:'<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
bell:'<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
arrow:'<path d="M5 12h14M13 6l6 6-6 6"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',play:'<path d="M6 4l14 8-14 8z"/>',
refresh:'<path d="M21 12a9 9 0 0 1-15.5 6.2L3 16M3 12a9 9 0 0 1 15.5-6.2L21 8M3 21v-5h5M21 3v5h-5"/>',
shield:'<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
dollar:'<path d="M12 2v20M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
store:'<path d="M3 9l1.5-5h15L21 9M3 9v11h18V9M3 9h18M9 20v-6h6v6"/>',inbox:'<path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.5 5h13L22 12v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-6z"/>',
cam:'<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>',db:'<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'};
const ic=(n,s=18)=>`<svg class="ic" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${ICONS[n]||''}</svg>`;

/* ---------- utils ---------- */
const api=async(p,b)=>{const r=await fetch('/api'+p,b===undefined?{}:{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(b)});const j=await r.json();if(j&&j.error&&!r.ok)throw new Error(j.error);return j};
const esc=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const money=n=>n==null?'—':'$'+Number(n).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
const nowMs=()=>Date.now()+META.clockOffsetHours*3600e3;
const fmtD=n=>new Date(nowMs()+n*86400e3).toLocaleString('en-US',{month:'long',day:'numeric'});
const ago=iso=>{const h=(nowMs()-new Date(iso))/3600e3;return h<1?Math.max(1,Math.round(h*60))+'m ago':h<48?Math.round(h)+'h ago':Math.round(h/24)+'d ago'};
const PILL={Pending:'warn','Pending Manager Review':'warn','Pending Auto Approval':'info',Approved:'ok','PO Issued':'ok',Rejected:'bad','On Hold':'bad',Flagged:'bad','Returned For Revision':'info','Handed Off':'info',delayed:'bad',critical:'bad',moderate:'warn',minor:'info',high:'bad',medium:'warn',low:'info',sent:'info',shipped:'ok',delivered:'ok',in_production:'info',acknowledged:'info',open:'warn',resolved:'ok',pending_documentation:'bad','Deadstock Risk':'bad',Overstock:'warn',Sent:'ok',High:'ok',Medium:'warn',Low:'bad',Unreliable:'bad','Reorder Recommended':'warn','No Reorder':'ok','Flagged For Review':'bad',missing:'bad',review:'warn',failed:'bad',ok:'ok'};
const pill=s=>`<span class="pill ${PILL[s]||''}">${esc(String(s).replace(/_/g,' '))}</span>`;
const mgr=()=>META.managers.find(m=>m.manager_id==$('#who').value)||META.managers[0];
const myStore=()=>mgr().store_id||1;
const initials=n=>String(n||'?').split(/\s+/).map(w=>w[0]).slice(0,2).join('').toUpperCase();
const firstName=n=>String(n||'').split(/\s+/)[0];
const tryLS=(k,v)=>{try{if(v===undefined)return localStorage.getItem(k);localStorage.setItem(k,v)}catch(e){}};
const empty=(i,t,s,btn='')=>`<div class="empty"><div class="ei">${ic(i,24)}</div><b>${t}</b>${s}${btn?`<div style="margin-top:14px">${btn}</div>`:''}</div>`;
const skeleton=()=>`<div class="skel" style="height:150px;margin-bottom:18px;border-radius:22px"></div><div class="grid g4 mb">${'<div class="skel" style="height:110px"></div>'.repeat(4)}</div><div class="skel" style="height:140px;margin-bottom:18px"></div><div class="grid g2"><div class="skel" style="height:340px"></div><div class="skel" style="height:340px"></div></div>`;

/* ---------- toasts & modals ---------- */
function toast(msg,tone='ok'){const t=document.createElement('div');t.className='toast tone-'+tone;const icn={ok:'check',bad:'alert',warn:'alert',info:'spark'}[tone]||'check';t.innerHTML=`<div class="ti">${ic(icn,15)}</div><div>${esc(msg)}</div>`;$('#toasts').append(t);setTimeout(()=>{t.classList.add('out');setTimeout(()=>t.remove(),320)},4600)}
function modal({title,sub='',body='',ok='Confirm',tone='pri',cancel='Cancel'}){return new Promise(res=>{const o=document.createElement('div');o.className='ov';o.innerHTML=`<div class="modal"><h3>${esc(title)}</h3>${sub?`<p>${esc(sub)}</p>`:''}${body}<div class="row"><button class="ghost" data-c>${cancel}</button><button class="${tone}" data-o>${ok}</button></div></div>`;document.body.append(o);
  const done=v=>{o.remove();document.removeEventListener('keydown',kd);res(v)};const kd=e=>{if(e.key==='Escape')done(null);if(e.key==='Enter'&&e.target.tagName!=='TEXTAREA')o.querySelector('[data-o]').click()};document.addEventListener('keydown',kd);
  o.onclick=e=>{if(e.target===o)done(null)};o.querySelector('[data-c]').onclick=()=>done(null);o.querySelector('[data-o]').onclick=()=>{const f=o.querySelector('input,textarea');done(f?f.value:true)};const f=o.querySelector('input,textarea');if(f){f.focus();f.select&&f.select()}})}
const askText=(title,sub,def='',ph='')=>modal({title,sub,body:`<input value="${esc(def)}" placeholder="${esc(ph)}">`,ok:'Save'});
const askConfirm=(title,sub)=>modal({title,sub,ok:'Yes, continue',tone:'bad'});

const act=async(fn,msg,btn)=>{if(btn)btn.classList.add('busy');try{const r=await fn();if(msg)toast(typeof msg==='function'?msg(r):msg);await render(true);return r}catch(e){toast(e.message,'bad')}finally{if(btn)btn.classList.remove('busy')}};

/* ---------- navigation ---------- */
const PAGES=[['Operate',[['dashboard','Dashboard','dash'],['monitoring','Monitoring','pulse'],['forecasts','Forecasts','trend']]],['Procure',[['requisitions','Requisitions','file'],['orders','Purchase orders','truck'],['receiving','Receiving','box']]],['Insights',[['stock','Stock health','heart']]],['Admin',[['system','System','cog']]]];
const FLAT=PAGES.flatMap(g=>g[1].map(p=>({k:p[0],l:p[1],i:p[2],g:g[0]})));
const go=p=>{page=p;try{history.replaceState(null,'','#'+p)}catch(e){}closePalette();render()};
const setTheme=t=>{document.documentElement.dataset.theme=t;tryLS('shoely-theme',t);$('#themebtn').innerHTML=ic(t==='dark'?'sun':'moon')};
const toggleTheme=()=>setTheme(document.documentElement.dataset.theme==='dark'?'light':'dark');

async function boot(){
  META=await api('/meta');if(FLAT.some(x=>x.k==_h))page=_h;
  $('#logo').innerHTML=ic('box',20);$('#sicon').innerHTML=ic('search',16);$('#cwai').innerHTML=ic('spark',20);$('#cwr').innerHTML=ic('refresh',16);$('#cwx').innerHTML=ic('x',16);$('#csend').innerHTML=ic('send',16);
  $('#fab').innerHTML=ic('spark',20)+'<span>Ask Shoely AI</span>';setTheme(document.documentElement.dataset.theme);
  $('#who').innerHTML=META.managers.map(m=>`<option value="${m.manager_id}">${esc(m.manager_name)} · ${esc(m.role)}</option>`).join('');
  $('#who').onchange=()=>{render();if($('#cw').classList.contains('open'))loadChat()};
  $('#main').innerHTML=skeleton();render();
}
async function render(keepScroll){
  try{
    META=await api('/meta');const m=mgr();$('#uav').textContent=initials(m.manager_name);
    $('#llm').innerHTML=META.llm?`<b><span class="dot"></span>Claude agent online</b>${esc(META.llm)} · tool-use enabled`:`<b><span class="dot off"></span>Fallback mode</b>Set ANTHROPIC_API_KEY for full agent`;
    $('#clock').innerHTML=`${ic('clock',15)}${META.today}${META.clockOffsetHours?` <span class="pill warn">+${META.clockOffsetHours}h sim</span>`:''}`;
    const d=await api('/dashboard');const badge={monitoring:d.kpis.pendingRecs,requisitions:d.kpis.pendingReqs,orders:d.kpis.delayedPOs,stock:d.kpis.stockFlags};
    $('#nav').innerHTML=PAGES.map(([g,items])=>`<div class="navgrp">${g}</div>`+items.map(([k,l,i])=>`<a class="${k==page?'on':''}" onclick="go('${k}')">${ic(i)}<span class="lbl">${l}</span>${badge[k]?`<span class="badge ${k=='orders'?'red':''}">${badge[k]}</span>`:''}</a>`).join('')).join('');
    const cur=FLAT.find(x=>x.k==page);$('#crumbs').innerHTML=`<span>${cur.g}</span><span>/</span><b>${cur.l}</b>`;
    const y=window.scrollY;$('#main').innerHTML=await V[page](d);if(V[page+'After'])V[page+'After']();
    if(keepScroll)window.scrollTo(0,y);else{window.scrollTo(0,0);const mn=$('#main');mn.style.animation='none';mn.offsetHeight;mn.style.animation=''}
  }catch(e){$('#main').innerHTML=empty('alert','Something went wrong',esc(e.message),'<button onclick="render()">Retry</button>')}
}

/* ---------- reusable components ---------- */
const ring=(pct,tone,icon)=>{const r=26,c=2*Math.PI*r;return `<div class="ring tone-${tone}"><svg width="64" height="64"><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--bg2)" stroke-width="7"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="var(--tc)" stroke-width="7" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c*(1-Math.min(1,Math.max(0,pct)))}"/></svg><div class="ri">${ic(icon,20)}</div></div>`};
const kpi=(label,val,sub,pct,tone,icon,to)=>`<div class="card kpi tone-${tone}" onclick="go('${to}')">${ring(pct,tone,icon)}<div><div class="kl">${label}</div><div class="kv2">${val}</div><div class="ks">${sub}</div></div></div>`;
const sbar=(on,th)=>{if(th==null)return `<div class="sbar none"><i style="width:${Math.min(100,on)}%"></i></div>`;const max=Math.max(th*2,on,1),low=on<=th;return `<div class="sbar ${low?'low':''}" title="${on} on hand · threshold ${th}"><i style="width:${Math.max(3,on/max*100)}%"></i><em style="left:${th/max*100}%"></em></div>`};
const stepper=(labels,idx,bad)=>`<div class="steps">${labels.map((l,i)=>`<div class="st ${i<idx?'done':i==idx?(bad?'bad':'now'):''}"><i>${i<idx?ic('check',14):i==idx&&bad?ic('alert',14):i+1}</i>${l}</div>`).join('')}</div>`;
const section=(title,icon,right='')=>`<div class="ch"><span style="color:var(--brand)">${ic(icon)}</span>${title}<span class="sp"></span>${right}</div>`;
const head=(t,p,r='')=>`<div class="pagehead"><div><h2>${t}</h2><p>${p}</p></div><div class="row">${r}</div></div>`;
const donut=(parts,size=130)=>{const tot=parts.reduce((a,p)=>a+p.v,0)||1,r=size/2-12,c=2*Math.PI*r;let off=0;return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--bg2)" stroke-width="16"/>${parts.map(p=>{const len=p.v/tot*c,s=`<circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${p.c}" stroke-width="16" stroke-dasharray="${len} ${c-len}" stroke-dashoffset="${-off}" transform="rotate(-90 ${size/2} ${size/2})"/>`;off+=len;return s}).join('')}<text x="50%" y="48%" text-anchor="middle" font-size="26" font-weight="800" fill="var(--text)">${parts[0]?Math.round(parts[0].v/tot*100):0}%</text><text x="50%" y="63%" text-anchor="middle" font-size="10.5" fill="var(--muted)">healthy</text></svg>`};
const invState=r=>r.reorder_threshold==null?'none':r.quantity_on_hand<=r.reorder_threshold?'low':'ok';

const recRow=(r,actions=true)=>`<div class="rec ${r.review_flag=='Yes'?'rev':''}"><div class="rid">RR<br>${r.recommendation_id}</div>
 <div><div class="row"><b>${esc(r.item_name)}</b><span class="mut">Size ${esc(r.size)} · ${esc(r.colorway)}</span>${r.review_flag=='Yes'?pill('review'):''}</div>
 <div class="row sm mut" style="margin-top:6px;gap:14px">${ic('store',13)}${esc(r.store_name)}<span style="width:130px">${sbar(r.quantity_on_hand,r.reorder_threshold)}</span><span><b class="${r.reorder_threshold!=null&&r.quantity_on_hand<=r.reorder_threshold?'low':''}">${r.quantity_on_hand}</b> on hand / ${r.reorder_threshold??'?'} min</span><span>Suggest <b style="color:var(--text)">${r.suggested_quantity}</b> pairs</span></div>
 <div class="why">${esc(r.rationale||'')}</div></div>
 <div class="row">${r.recommendation_status=='Pending'&&actions?`<button class="pri sm" onclick="approveRec(${r.recommendation_id},this)">${ic('check',14)}Approve</button><button class="bad sm" onclick="rejectRec(${r.recommendation_id},this)">Reject</button>`:pill(r.recommendation_status)}</div></div>`;

/* ---------- actions ---------- */
const approveRec=(id,b)=>act(()=>api(`/recommendations/${id}/approve`,{managerId:mgr().manager_id}),r=>`RR-${id} approved → ${r.draft.decision}${r.draft.poId?' · PO-'+r.draft.poId+' issued':''}${r.draft.note?' ('+r.draft.note+')':''}`,b);
const rejectRec=async(id,b)=>{const reason=await askText(`Reject RR-${id}?`,'Optional reason — it is logged in the audit trail.','','e.g. enough stock in transit');if(reason===null)return;act(()=>api(`/recommendations/${id}/reject`,{managerId:mgr().manager_id,reason}),`RR-${id} rejected`,b)};
const runMon=(periodic,b)=>act(()=>api('/monitoring/run',{periodic}),r=>`Checked ${r.checked} SKUs · ${r.reorderRecommended} new recommendations · ${r.flagged} flagged`,b);
const adv=h=>act(()=>api('/clock/advance',{hours:h}),r=>`+${h}h · ${r.actions.join('; ')||'no timers fired'}`);
const setTh=async(i,s,c)=>{const v=await askText('Set reorder threshold','Stock at or below this level triggers a reorder recommendation.',c||'','e.g. 12');if(v!==null&&v!=='')act(()=>api('/monitoring/threshold',{itemId:i,storeId:s,threshold:+v,managerId:mgr().manager_id}),'Threshold saved')};
const decide=(id,t,b)=>act(()=>api(`/requisitions/${id}/decide`,{managerId:mgr().manager_id,decision:t,reason:$('#reason')?.value}),r=>`REQ-${id}: ${r.requisition_status}${r.po?' · PO-'+r.po.po_id:''}`,b);
const receive=b=>{const lines=[...document.querySelectorAll('tr[data-item]')].map(tr=>({itemId:+tr.dataset.item,qty:+tr.querySelector('.q').value,condition:tr.querySelector('.c').value,photo:tr.querySelector('.ph').checked?'photo.jpg':null}));act(()=>api('/receipts',{poId:+sel.rp,lines,receivedBy:'CLK-004'}),r=>r.summary,b)};
const resetData=async()=>{if(await askConfirm('Reset all demo data?','This restores the original seed and removes everything you created.'))act(()=>api('/reset',{}),'Demo data reset')};

/* ---------- pages ---------- */
const V={
async dashboard(d){
  const [recs,reqs,pos,inv,flags]=await Promise.all([api('/recommendations'),api('/requisitions'),api('/purchase-orders'),api('/inventory'),api('/stock-flags')]);INV=inv;
  const k=d.kpis,st=inv.reduce((a,r)=>(a[invState(r)]++,a),{ok:0,low:0,none:0}),health=inv.length?st.ok/inv.length:0,pend=k.pendingRecs+k.pendingReqs;
  const stores=[...new Set(inv.map(r=>r.store_name))];
  const byStore=stores.map(s=>{const rows=inv.filter(r=>r.store_name==s),c=rows.reduce((a,r)=>(a[invState(r)]++,a),{ok:0,low:0,none:0});return{s,c,n:rows.length}});
  const inflight=pos.filter(p=>!['delivered','cancelled'].includes(p.status)),spend=inflight.reduce((a,p)=>a+(p.total_amount||0),0);
  const hot=n=>n>0?'hot':'';
  const feed=[...d.notifications.slice(0,6).map(n=>({t:n.subject,s:(n.body||'').slice(0,90),at:n.sent_at,k:n.kind=='delay_alert'?'bad':'ok'}))];
  return `<div class="hero"><div class="tags"><span class="tag">${ic('spark',12)} AI agents active</span><span class="tag">Auto-approval limit ${money(META.approvalLimit)}</span><span class="tag">${stores.length} stores · ${inv.length} SKU-locations</span></div>
  <h1>Welcome back, ${esc(firstName(mgr().manager_name))}.</h1>
  <p>${pend?`<b>${pend} decision${pend>1?'s':''}</b> waiting on you`:'Nothing is waiting on you'}${k.delayedPOs?`, <b>${k.delayedPOs} PO${k.delayedPOs>1?'s':''} running late</b>`:''}${st.low?`, and <b>${st.low} SKU${st.low>1?'s':''}</b> are at or below threshold`:''}. Agents monitor stock, forecast demand and draft orders — you approve.</p>
  <div class="row"><button class="wht" onclick="runMon(false,this)">${ic('play',14)}Run monitoring</button><button onclick="runMon(true,this)">${ic('refresh',14)}Periodic review</button><button onclick="toggleChat(true)">${ic('spark',14)}Ask the assistant</button></div></div>
  <div class="grid g4 mb">
   ${kpi('Inventory health',Math.round(health*100)+'%',`${st.low} below threshold · ${st.none} unmonitored`,health,health>.85?'ok':health>.6?'warn':'bad','heart','monitoring')}
   ${kpi('Decisions pending',pend,`${k.pendingRecs} recommendations · ${k.pendingReqs} requisitions`,pend?Math.min(1,pend/20):0,pend?'brand':'ok','inbox','monitoring')}
   ${kpi('Open purchase orders',k.openPOs,`${money(spend)} in flight · ${k.delayedPOs} delayed`,k.openPOs?1-k.delayedPOs/k.openPOs:1,k.delayedPOs?'bad':'info','truck','orders')}
   ${kpi('Stock health flags',k.stockFlags,`${k.deadstock} deadstock risk`,inv.length?k.stockFlags/inv.length:0,k.stockFlags?'warn':'ok','shield','stock')}
  </div>
  <div class="card mb">${section('Agentic workflow','spark','<span class="mut sm">Live counts across the procurement lifecycle</span>')}
   <div class="pipe">
    <div class="pstep tone-brand ${hot(k.pendingRecs)}" onclick="go('monitoring')"><div class="pi">${ic('pulse')}</div><div class="pn">${inv.length}</div><div class="pl">Monitored SKUs</div><div class="ps">${st.low} breaching</div></div>
    <div class="pstep tone-warn ${hot(k.pendingRecs)}" onclick="go('monitoring')"><div class="pi">${ic('bell')}</div><div class="pn">${k.pendingRecs}</div><div class="pl">Recommendations</div><div class="ps">${k.reviewRecs} need review</div></div>
    <div class="pstep tone-info ${hot(k.pendingReqs)}" onclick="go('requisitions')"><div class="pi">${ic('file')}</div><div class="pn">${reqs.length}</div><div class="pl">Requisitions</div><div class="ps">${k.pendingReqs} need action</div></div>
    <div class="pstep tone-brand" onclick="go('orders')"><div class="pi">${ic('truck')}</div><div class="pn">${k.openPOs}</div><div class="pl">Open POs</div><div class="ps">${k.delayedPOs} delayed</div></div>
    <div class="pstep tone-ok" onclick="go('receiving')"><div class="pi">${ic('box')}</div><div class="pn">${pos.filter(p=>p.status=='delivered').length}</div><div class="pl">Received</div><div class="ps">reconciled</div></div>
    <div class="pstep tone-bad ${hot(k.stockFlags)}" onclick="go('stock')"><div class="pi">${ic('heart')}</div><div class="pn">${flags.length}</div><div class="pl">Stock flags</div><div class="ps">${k.deadstock} deadstock</div></div>
   </div></div>
  <div class="grid g2 mb"><div class="card flush"><div class="cp">${section('Needs your decision','inbox',`<button class="sm" onclick="go('monitoring')">View all ${recs.filter(r=>r.recommendation_status=='Pending').length} ${ic('arrow',13)}</button>`)}</div>
    ${d.recs.map(r=>recRow(r)).join('')||empty('check','All caught up','No pending recommendations.',`<button class="pri" onclick="runMon(false,this)">Run monitoring</button>`)}</div>
   <div class="card">${section('Inventory health by store','store')}
    <div class="donutwrap" style="margin-bottom:6px">${donut([{v:st.ok,c:'var(--ok)'},{v:st.low,c:'var(--bad)'},{v:st.none,c:'var(--faint)'}])}<div class="legend" style="flex-direction:column;gap:8px"><span><i style="background:var(--ok)"></i>Healthy · ${st.ok}</span><span><i style="background:var(--bad)"></i>At / below threshold · ${st.low}</span><span><i style="background:var(--faint)"></i>No threshold · ${st.none}</span></div></div>
    ${byStore.map(b=>`<div class="hbar"><span class="b">${esc(b.s)}</span><div class="tr"><i style="width:${b.c.ok/b.n*100}%;background:var(--ok)"></i><i style="width:${b.c.low/b.n*100}%;background:var(--bad)"></i><i style="width:${b.c.none/b.n*100}%;background:var(--faint)"></i></div><span class="mut sm">${b.n} SKUs</span></div>`).join('')}</div></div>
  <div class="grid g3"><div class="card">${section('Purchase order tracker','truck')}${d.pos.map(p=>`<div class="kv" style="align-items:center"><span><a href="#" onclick="sel.po=${p.po_id};go('orders');return false">PO-${p.po_id}</a> <b>${esc(p.supplier_name)}</b><div class="mut sm">Delivery ${p.expected_delivery_date} · ${money(p.total_amount)}</div></span>${pill(p.status)}</div>`).join('')||empty('truck','No open orders','Approved reorders become POs.')}</div>
   <div class="card">${section('Activity','bell')}<div class="feed">${feed.map(f=>`<div class="fi ${f.k}"><b>${esc(f.t)}</b><span>${esc(f.s)} · ${ago(f.at)}</span></div>`).join('')||'<span class="mut">No activity yet.</span>'}</div></div>
   <div class="card">${section('Monitoring log','pulse')}${d.log.map(l=>`<div class="kv" style="align-items:center"><span><b>${esc(l.item_name)}</b> <span class="mut sm">${l.size} · ${esc(l.store_name)}</span><div class="mut sm">${esc((l.detail||'').slice(0,70))}</div></span>${pill(l.monitor_result)}</div>`).join('')}</div></div>`},

async monitoring(){
  const [recs,inv]=await Promise.all([api('/recommendations'),api('/inventory')]);INV=inv;const pend=recs.filter(r=>r.recommendation_status=='Pending');
  return head('Inventory monitoring','Agents compare on-hand stock to each SKU’s threshold and forecast. Breaches become reorder recommendations — nothing is ordered until you approve.',`<button class="pri" onclick="runMon(false,this)">${ic('play',14)}Run monitoring</button><button onclick="runMon(true,this)">${ic('refresh',14)}Periodic review</button>`)+
  `<div class="card flush mb"><div class="cp">${section('Reorder recommendations','inbox',`<span class="pill warn">${pend.length} pending</span>`)}</div>${recs.map(r=>recRow(r)).join('')||empty('inbox','No recommendations yet','Run monitoring to scan every SKU.',`<button class="pri" onclick="runMon(false,this)">Run monitoring</button>`)}</div>
  <div class="card flush"><div class="cp">${section('Inventory & monitoring parameters','db')}<div class="row mb"><input id="fq" placeholder="Search item, size, store…" style="min-width:260px" oninput="sel.mq=this.value;drawInv()" value="${esc(sel.mq||'')}"><select onchange="sel.ms=this.value;drawInv()"><option value="">All stores</option>${META.stores.map(s=>`<option value="${esc(s.store_name)}" ${sel.ms==s.store_name?'selected':''}>${esc(s.store_name)}</option>`).join('')}</select><div class="seg" id="seg"><button data-v="" onclick="sel.mf='';drawInv()">All</button><button data-v="low" onclick="sel.mf='low';drawInv()">At risk</button><button data-v="none" onclick="sel.mf='none';drawInv()">No threshold</button></div><span class="sp"></span><span class="mut sm" id="invcount"></span></div></div><div class="tscroll"><table><thead><tr><th>Item</th><th>Store</th><th>Stock level</th><th>On hand</th><th>Threshold</th><th>30d forecast</th><th>Updated</th><th></th></tr></thead><tbody id="invtbl"></tbody></table></div></div>`},
monitoringAfter(){drawInv()},

async forecasts(){
  const inv=await api('/inventory');sel.f=sel.f||`${inv[0].item_id}/${inv[0].store_id}`;const d=await api('/forecast/'+sel.f),f=d.forecast,mx=Math.max(1,...d.weeks.map(w=>w.units)),W=620,H=230,pl=34,pb=26,pt=22,bw=(W-pl)/d.weeks.length;
  const pace=f.predicted_demand!=null?f.predicted_demand/(30/7):null,top=Math.max(mx,pace||0,1),Y=v=>pt+(H-pt-pb)*(1-v/top);const tone={High:'ok',Medium:'warn',Low:'bad',Unreliable:'bad'}[f.forecast_confidence]||'info',lv={High:3,Medium:2,Low:1,Unreliable:0}[f.forecast_confidence]??0;
  const total=d.weeks.reduce((a,w)=>a+w.units,0);
  return head('Demand forecasting','Claude blends 12 weeks of sales history with seasonality to predict the next 30 days — and tells you how much to trust it.',`<select onchange="sel.f=this.value;render()" style="min-width:300px">${inv.map(r=>`<option value="${r.item_id}/${r.store_id}" ${sel.f==r.item_id+'/'+r.store_id?'selected':''}>${esc(r.item_name)} · ${r.size} @ ${esc(r.store_name)}</option>`).join('')}</select><button class="pri" onclick="act(()=>api('/forecast/${sel.f}?force=1'),'Forecast regenerated',this)">${ic('refresh',14)}Regenerate</button>`)+
  `<div class="grid g2"><div class="card">${section(`${esc(d.item.item_name)} · size ${esc(d.item.size)} <span class="mut" style="font-weight:500">@ ${esc(d.store.store_name)}</span>`,'trend',`<span class="legend"><span><i style="background:var(--brand)"></i>Weekly units</span><span><i style="background:var(--warn)"></i>Forecast pace</span></span>`)}
   <svg viewBox="0 0 ${W} ${H}" width="100%"><defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset="1" stop-color="#5b5bf0"/></linearGradient></defs>
   ${[0,.5,1].map(t=>`<line x1="${pl}" x2="${W}" y1="${Y(top*t)}" y2="${Y(top*t)}" stroke="var(--border)" stroke-dasharray="3 5"/><text x="${pl-8}" y="${Y(top*t)+4}" text-anchor="end" font-size="10" fill="var(--faint)">${Math.round(top*t)}</text>`).join('')}
   ${d.weeks.map((w,i)=>{const x=pl+i*bw+bw*.18,h=Math.max(2,(H-pt-pb)*w.units/top);return `<rect x="${x}" y="${H-pb-h}" width="${bw*.64}" height="${h}" rx="6" fill="url(#bg)" opacity=".92"><title>${w.units} units · week ending ${w.week}</title></rect><text x="${x+bw*.32}" y="${H-pb-h-6}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--text)">${w.units||''}</text><text x="${x+bw*.32}" y="${H-8}" text-anchor="middle" font-size="9" fill="var(--faint)">${w.week}</text>`}).join('')}
   ${pace!=null?`<line x1="${pl}" x2="${W}" y1="${Y(pace)}" y2="${Y(pace)}" stroke="var(--warn)" stroke-width="2" stroke-dasharray="7 5"/><text x="${pl+4}" y="${Y(pace)-7}" text-anchor="start" font-size="10.5" font-weight="700" fill="var(--warn)">forecast ≈ ${pace.toFixed(1)}/wk</text>`:''}</svg>
   <div class="row mut sm" style="margin-top:8px"><span>${total} units sold in last 12 weeks</span><span class="sp"></span><span>${(total/12).toFixed(1)} avg / week</span></div></div>
  <div class="card tone-${tone}">${section('30-day prediction','spark')}<div class="row" style="align-items:flex-end"><div class="big">${f.predicted_demand??'n/a'}</div><span class="mut" style="margin-bottom:6px">pairs</span></div><div class="mut sm" style="margin:4px 0 16px">${f.period_start} → ${f.period_end}</div>
   <div class="row" style="margin-bottom:8px"><b>Confidence</b>${pill(f.forecast_confidence)}${f.review_flag=='Yes'?pill('review'):''}${f.outdated_flag=='Yes'?`<span class="pill warn">outdated</span>`:''}</div><div class="confbar">${[1,2,3].map(i=>`<i class="${i<=lv?'on':''}"></i>`).join('')}</div>
   <div class="mail" style="margin-top:16px;white-space:normal">${esc(f.forecast_justification||'No justification recorded.')}</div><div class="kv"><span class="mut">Model</span><span class="b">${esc(f.model_version)}</span></div></div></div>`},

async requisitions(){
  const rs=await api('/requisitions');sel.req=sel.req||(rs.find(r=>r.requisition_status=='Pending Manager Review')||rs[0])?.requisition_id;const r=sel.req?await api('/requisitions/'+sel.req):null;let det='';
  const STEP=['Drafted','Manager review','Approved','PO issued'],badSt=['Rejected','On Hold','Flagged','Returned For Revision'];
  if(r){const sups=r.lines[0]?await api('/suppliers/'+r.lines[0].item_id):[];const can=r.requisition_status=='Pending Manager Review',stIdx={'Pending Auto Approval':1,'Pending Manager Review':1,Approved:2,'PO Issued':3}[r.requisition_status]??1,isBad=badSt.includes(r.requisition_status),pct=r.approval_limit?r.total_estimated_cost/r.approval_limit:0;
  det=`<div class="card">${section(`REQ-${r.requisition_id}`,'file',pill(r.requisition_status))}${stepper(STEP,isBad?1:stIdx,isBad)}
   ${r.lines.map(l=>`<div class="kv"><span><b>${esc(l.item_name)}</b> · Size ${l.size}<div class="mut sm">${l.recommended_quantity} pairs × ${money(l.unit_price)}</div></span><b>${money(l.recommended_quantity*l.unit_price)}</b></div><div class="mail" style="white-space:normal">${esc(l.forecast_justification||'')}</div>`).join('')}
   <div style="margin:16px 0 6px" class="row"><b>Cost vs approval limit</b><span class="sp"></span><span class="mut sm">${money(r.total_estimated_cost)} / ${money(r.approval_limit)}</span></div><div class="gauge ${pct>1?'over':''}"><i style="width:${Math.min(100,pct*100)}%"></i></div>
   <div class="kv" style="margin-top:12px"><span class="mut">Supplier</span><span class="b">${esc(r.supplier_name||'—')} ${r.supplier_valid_flag=='No'?pill('invalid'):''}</span></div><div class="kv"><span class="mut">Approval path</span><span class="b">${esc(r.approval_method||'—')}</span></div>${r.forecast?`<div class="kv"><span class="mut">Forecast</span><span class="b">${r.forecast.predicted_demand} pairs · ${r.forecast.forecast_confidence}</span></div>`:''}
   ${r.status_note?`<div class="alert warn"><span class="ai">${ic('alert')}</span><div>${esc(r.status_note)}</div></div>`:''}
   ${can?`<textarea id="reason" rows="2" placeholder="Reason (required to reject / return)" style="margin-top:10px"></textarea><div class="row" style="margin-top:10px"><button class="pri" onclick="decide(${r.requisition_id},'Approved',this)">${ic('check',14)}Approve & issue PO</button><button onclick="decide(${r.requisition_id},'Returned For Revision',this)">Return</button><button class="bad" onclick="decide(${r.requisition_id},'Rejected',this)">Reject</button></div>`:''}
   ${badSt.includes(r.requisition_status)&&r.recommendation_id?`<div class="alert"><span class="ai">${ic('spark')}</span><div style="flex:1"><b>Let the agent fix this</b><div class="mut sm" style="margin:2px 0 10px">Pick a valid supplier and the agent will re-draft the requisition.</div><div class="row"><select id="sup">${sups.map(s=>`<option value="${s.supplier_id}" ${s.supplier_valid_flag=='No'?'disabled':''}>${esc(s.supplier_name)} · ${money(s.unit_price)}${s.supplier_valid_flag=='No'?' (invalid)':''}</option>`).join('')}</select><button class="pri" onclick="act(()=>api('/requisitions/${r.requisition_id}/revise',{supplierId:+$('#sup').value}),x=>'Agent revised → '+x.decision,this)">${ic('spark',14)}Agent: revise requisition</button></div></div></div>`:''}
   ${r.po?`<div class="kv"><span class="mut">Purchase order</span><a href="#" onclick="sel.po=${r.po.po_id};go('orders');return false">PO-${r.po.po_id} · ${r.po.status} →</a></div>`:''}
   ${r.decisions.length?`<h4 style="margin:18px 0 10px">Decision history</h4><div class="feed">${r.decisions.map(x=>`<div class="fi ${x.decision_type=='Rejected'?'bad':'ok'}"><b>${esc(x.decision_type)} · ${esc(x.manager_name||'Auto-approval')}</b><span>${esc(x.reason||'')} ${ago(x.reviewed_at)}</span></div>`).join('')}</div>`:''}</div>`}
  return head('Requisitions & approvals','Within-limit, high-confidence requisitions auto-approve. Everything else — over-limit, low confidence, invalid supplier — lands here for a human.')+
  `<div class="grid g21"><div class="card flush"><div class="tscroll"><table><thead><tr><th>ID</th><th>Items</th><th>Cost</th><th>Status</th></tr></thead><tbody>${rs.map(x=>`<tr class="click ${sel.req==x.requisition_id?'sel':''}" onclick="sel.req=${x.requisition_id};render(true)"><td class="b">REQ-${x.requisition_id}</td><td class="item"><b>${esc(x.items||'—')}</b><span>${esc(x.store_name)}</span></td><td class="b">${money(x.total_estimated_cost)}</td><td>${pill(x.requisition_status)}</td></tr>`).join('')||`<tr><td colspan=4>${empty('file','No requisitions yet','Approve a recommendation to create one.')}</td></tr>`}</tbody></table></div></div><div>${det||''}</div></div>`},

async orders(){
  const ps=await api('/purchase-orders');sel.po=sel.po||ps[0]?.po_id;const p=sel.po?await api('/purchase-orders/'+sel.po):null;let det='';
  const STEP=['Sent','Acknowledged','In production','Shipped','Delivered'],map={sent:0,acknowledged:1,in_production:2,shipped:3,delivered:4,delayed:2};
  if(p)det=`<div class="card">${section(`PO-${p.po_id} · ${esc(p.supplier_name)}`,'truck',pill(p.status))}${stepper(STEP,map[p.status]??0,p.status=='delayed')}
   <div class="grid g11" style="gap:0 24px"><div class="kv"><span class="mut">Channel</span><span class="b">${p.preferred_channel}</span></div><div class="kv"><span class="mut">Total</span><span class="b">${money(p.total_amount)}</span></div><div class="kv"><span class="mut">Expected ship</span><span class="b">${p.expected_ship_date}</span></div><div class="kv"><span class="mut">Expected delivery</span><span class="b">${p.expected_delivery_date}</span></div></div>
   ${p.lines.map(l=>`<div class="kv"><span>${esc(l.item_name)} · ${l.size}</span><span class="b">${l.quantity_ordered} × ${money(l.unit_price)}</span></div>`).join('')}
   ${p.delayFlags.map(f=>`<div class="alert"><span class="ai">${ic('alert',22)}</span><div style="flex:1"><div class="row"><b>${f.delay_days} days late</b>${pill(f.severity)}<span class="mut sm">new date ${f.revised_date}</span></div><div class="mut sm">${esc(f.notes||'')}</div>${f.acknowledged_by?'<span class="pill ok" style="margin-top:8px">acknowledged</span>':`<button class="sm" style="margin-top:10px" onclick="act(()=>api('/delay-flags/${f.flag_id}/acknowledge',{managerId:mgr().manager_id}),'Delay acknowledged',this)">${ic('check',13)}Acknowledge</button>`}</div></div>`).join('')}
   ${p.alerts.map(a=>`<div class="row sm mut" style="margin-top:8px">${ic('bell',14)}${pill(a.priority)}<span>${esc(a.manager_name||'')}: ${esc(a.message)}</span></div>`).join('')}</div>
  <div class="card">${section('Simulate supplier reply','mail',`<span class="mut sm">parsed by ${META.llm?'Claude':'rule-based parser'}</span>`)}<textarea id="smsg" rows="3">Hi team, production ran behind. We now expect to ship around ${fmtD(25)} and delivery should be about ${fmtD(35)}. Sorry for the trouble.</textarea>
   <div class="row" style="margin-top:10px"><button class="pri" onclick="act(()=>api('/purchase-orders/${p.po_id}/supplier-message',{text:$('#smsg').value}),r=>'Agent: '+r.decision+(r.severity?' ('+r.severity+', '+r.delayDays+'d late)':''),this)">${ic('send',14)}Send to agent</button><button onclick="$('#smsg').value='Thanks, we confirm receipt of your order and it is now in production.'">Preset: acknowledge</button><button onclick="$('#smsg').value='Will advise soon.'">Preset: vague</button></div></div>
  <div class="card">${section('Correspondence & updates','mail')}${p.correspondence.map(c=>`<div class="row sm mut">${pill(c.tone)} via ${c.channel} · ${ago(c.created_at)}</div><div class="mail">${esc(c.body)}</div>`).join('')}${p.updates.map(u=>`<div class="kv"><span>${u.reported_status?pill(u.reported_status):pill('unparsed')} <span class="mut sm">ship ${u.reported_ship_date||'—'} · delivery ${u.reported_delivery_date||'—'}</span><div class="mut sm">${esc((u.raw_text||'').slice(0,110))}</div></span><span class="mut sm">${ago(u.update_timestamp)}</span></div>`).join('')}${!p.correspondence.length&&!p.updates.length?'<span class="mut">No messages yet.</span>':''}</div>`;
  return head('Purchase orders','Issued POs are immutable. Agents transmit them, parse supplier replies, grade delays and escalate when nobody answers.')+
  `<div class="grid g21"><div class="card flush"><div class="tscroll"><table><thead><tr><th>PO</th><th>Supplier</th><th>Delivery</th><th>Status</th></tr></thead><tbody>${ps.map(x=>`<tr class="click ${sel.po==x.po_id?'sel':''}" onclick="sel.po=${x.po_id};render(true)"><td class="b">PO-${x.po_id}</td><td class="item"><b>${esc(x.supplier_name)}</b><span>${esc(x.items||'')} · ${esc(x.store_name)}</span></td><td>${x.expected_delivery_date}</td><td>${pill(x.status)}</td></tr>`).join('')||`<tr><td colspan=4>${empty('truck','No purchase orders','Approve a reorder to issue one.')}</td></tr>`}</tbody></table></div></div><div>${det}</div></div>`},

async receiving(){
  const ps=(await api('/purchase-orders')).filter(p=>['sent','acknowledged','in_production','shipped','delayed'].includes(p.status)),ds=await api('/discrepancies');sel.rp=sel.rp||ps[0]?.po_id;const p=sel.rp?await api('/purchase-orders/'+sel.rp):null;
  return head('Receiving & reconciliation','Log what physically arrived. The agent reconciles against the PO, spots shortages and damage, and routes exceptions. Damage claims need photo evidence.')+
  `<div class="grid g2"><div class="card">${section('Receive shipment','box')}${p?`<select onchange="sel.rp=this.value;render(true)" style="margin-bottom:14px;width:100%">${ps.map(x=>`<option value="${x.po_id}" ${x.po_id==sel.rp?'selected':''}>PO-${x.po_id} · ${esc(x.supplier_name)}</option>`).join('')}</select>
   <div class="card flush" style="box-shadow:none;margin:0"><table><thead><tr><th>Item</th><th>Ordered</th><th>Received</th><th>Condition</th><th>${ic('cam',14)}</th></tr></thead><tbody>${p.lines.map(l=>`<tr data-item="${l.item_id}"><td class="item"><b>${esc(l.item_name)}</b><span>Size ${l.size}</span></td><td class="b">${l.quantity_ordered}</td><td><input class="q" type="number" min="0" value="${l.quantity_ordered}" style="width:80px"></td><td><select class="c"><option>good</option><option>partial_damage</option><option>damaged</option></select></td><td><input class="ph" type="checkbox" style="width:18px;height:18px" title="Photo attached"></td></tr>`).join('')}</tbody></table></div>
   <div class="row" style="margin-top:14px"><button class="pri" onclick="receive(this)">${ic('check',14)}Submit receipt</button><span class="mut sm">Try fewer pairs, or “damaged” without a photo.</span></div>`:empty('box','No open purchase orders','Nothing is waiting to be received.')}</div>
  <div class="card">${section('Discrepancies','alert',`<span class="pill ${ds.length?'warn':'ok'}">${ds.length}</span>`)}${ds.map(d=>`<div class="alert ${d.severity=='low'?'warn':''}"><span class="ai">${ic('alert')}</span><div style="flex:1"><div class="row"><b>DS-${d.discrepancy_id}</b>${pill(d.discrepancy_type)}${pill(d.severity)}${pill(d.status)}</div><div style="margin:4px 0">${esc(d.summary)}</div><div class="mut sm">Recommended: ${d.recommended_action.replace(/_/g,' ')} ${d.routed_to?'· routed to '+esc(d.routed_to):''}</div><div class="row" style="margin-top:10px">${d.status=='pending_documentation'?`<button class="sm" onclick="act(()=>api('/discrepancies/${d.discrepancy_id}/photo',{photo:'evidence.jpg'}),'Photo attached & routed',this)">${ic('cam',13)}Attach photo</button>`:''}${['open','escalated','under_review'].includes(d.status)?`<button class="pri sm" onclick="act(()=>api('/discrepancies/${d.discrepancy_id}/resolve',{managerId:mgr().manager_id,action:'${d.recommended_action}'}),'Resolved',this)">Approve: ${d.recommended_action.replace(/_/g,' ')}</button>`:''}</div></div></div>`).join('')||empty('shield','No discrepancies','Receipts that match the PO reconcile automatically.')}</div></div>`},

async stock(){
  const fl=await api('/stock-flags'),over=fl.filter(f=>f.flag_type=='Overstock').length,dead=fl.filter(f=>f.flag_type=='Deadstock Risk').length;
  return head('Stock health','Days of supply = on hand ÷ forecast daily demand. Over 90 days is overstock; over 180 days (or no sales in 90) is deadstock risk.',`<button class="pri" onclick="act(()=>api('/stock-health/run',{}),r=>r.flagged+' items flagged · '+r.excluded+' excluded',this)">${ic('play',14)}Run analysis</button>`)+
  `<div class="grid g3 mb">${kpi('Overstock',over,'> 90 days of supply',fl.length?over/fl.length:0,'warn','box','stock')}${kpi('Deadstock risk',dead,'> 180 days or no sales',fl.length?dead/fl.length:0,'bad','alert','stock')}${kpi('Total flagged',fl.length,'awaiting acknowledgement',fl.length?fl.filter(f=>f.acknowledged_by).length/fl.length:1,'brand','shield','stock')}</div>
  <div class="card flush"><table><thead><tr><th>Item</th><th>Store</th><th>On hand</th><th>Forecast</th><th>Days of supply</th><th>Flag</th><th></th></tr></thead><tbody>${fl.map(f=>{const dos=f.days_of_supply;return `<tr><td class="item"><b>${esc(f.item_name)}</b><span>Size ${f.size}</span></td><td>${esc(f.store_name)}</td><td class="b">${f.quantity_on_hand}</td><td>${f.forecasted_demand}</td><td style="min-width:170px"><div class="row"><div class="sbar ${dos==null||dos>180?'low':''}" style="flex:1"><i style="width:${dos==null?100:Math.min(100,dos/365*100)}%;${dos!=null&&dos<=180?'background:var(--warn)':''}"></i><em style="left:${90/365*100}%"></em></div><b>${dos??'∞'}</b></div></td><td>${pill(f.flag_type)}</td><td>${f.acknowledged_by?'<span class="pill ok">acknowledged</span>':`<button class="sm" onclick="act(()=>api('/stock-flags/${f.flag_id}/acknowledge',{managerId:mgr().manager_id}),'Acknowledged',this)">Acknowledge</button>`}</td></tr>`}).join('')||`<tr><td colspan=7>${empty('heart','No flags yet','Run the analysis to find overstock and deadstock.',`<button class="pri" onclick="act(()=>api('/stock-health/run',{}),r=>r.flagged+' items flagged',this)">Run analysis</button>`)}</td></tr>`}</tbody></table></div>`},

async system(){
  const [tables,llm,notes,alog]=await Promise.all([api('/schema'),api('/llm-log'),api('/notifications'),api('/action-log')]);
  return head('System & transparency','Demo controls, a full audit trail of every agent action, and every LLM call made on your behalf.')+
  `<div class="grid g11"><div><div class="card">${section('Simulated clock','clock')}<p class="mut sm" style="margin-top:0">SLA timers (24h supplier ack, 4h critical escalation, 24/48h requisition review, 48h discrepancy) run on a simulated clock. Offset: <b>+${META.clockOffsetHours}h</b></p><div class="row"><button onclick="adv(4)">+4h</button><button onclick="adv(24)">+24h</button><button onclick="adv(48)">+48h</button><button class="pri" onclick="act(()=>api('/tick',{}),r=>r.actions.join('; ')||'No timers fired',this)">${ic('play',14)}Run timers</button></div></div>
  <div class="card">${section('Approval limit','dollar')}<div class="row"><input id="lim" type="number" value="${META.approvalLimit}" style="width:160px"><button class="pri" onclick="act(()=>api('/settings/approval-limit',{value:+$('#lim').value}),'Limit updated',this)">Save</button></div></div>
  <div class="card">${section('Action log','shield')}<div class="feed">${alog.slice(0,10).map(a=>`<div class="fi"><b>${esc(a.action_details)}</b><span>${pill(a.intent)} ${esc(a.manager_name||'system')} · ${ago(a.logged_at)}</span></div>`).join('')||'<span class="mut">Nothing logged yet.</span>'}</div></div>
  <div class="card">${section('LLM call audit','spark')}${llm.slice(0,10).map(l=>`<div class="kv"><span>${l.ok?pill('ok'):pill('failed')} <b>${esc(l.kind)}</b><div class="mut sm">${esc((l.prompt||'').slice(0,90))}</div></span><span class="mut sm">${ago(l.created_at)}</span></div>`).join('')||'<span class="mut">No LLM calls yet.</span>'}</div></div>
  <div><div class="card">${section('Notifications','bell')}${notes.slice(0,8).map(n=>`<div class="kv"><span><b>${esc(n.subject)}</b><div class="mut sm">${pill(n.kind)} to ${esc(n.manager_name)}</div></span><span class="mut sm">${ago(n.sent_at)}</span></div>`).join('')}</div>
  <div class="card">${section('Database (SQLite)','db')}<div class="grid g11" style="gap:0 24px">${tables.map(t=>`<div class="kv"><span class="mut">${t.table}</span><b>${t.rows}</b></div>`).join('')}</div></div>
  <button class="bad" onclick="resetData()">${ic('refresh',14)}Reset demo data</button></div></div>`}
};

/* inventory table (client-side filter) */
function drawInv(){
  const q=(sel.mq||'').toLowerCase(),s=sel.ms||'',f=sel.mf||'';document.querySelectorAll('#seg button').forEach(b=>b.classList.toggle('on',b.dataset.v==f));
  const rows=INV.filter(r=>(!s||r.store_name==s)&&(!f||invState(r)==f)&&(!q||`${r.item_name} ${r.size} ${r.colorway} ${r.store_name}`.toLowerCase().includes(q)));
  const t=$('#invtbl');if(!t)return;$('#invcount').textContent=`${rows.length} of ${INV.length} SKU-locations`;
  t.innerHTML=rows.map(r=>`<tr><td class="item"><b>${esc(r.item_name)}</b><span>Size ${esc(r.size)} · ${esc(r.colorway)}</span></td><td>${esc(r.store_name)}</td><td style="min-width:150px">${sbar(r.quantity_on_hand,r.reorder_threshold)}</td><td class="${invState(r)=='low'?'low':'b'}">${r.quantity_on_hand}</td><td>${r.reorder_threshold??pill('missing')}</td><td>${r.forecast??'—'}</td><td class="mut sm">${ago(r.last_updated_at)}</td><td><button class="sm" onclick="setTh(${r.item_id},${r.store_id},${r.reorder_threshold||0})">Set threshold</button></td></tr>`).join('')||`<tr><td colspan=8>${empty('search','No matches','Try a different filter.')}</td></tr>`;
}

/* ---------- command palette ---------- */
let palIdx=0,palItems=[];
const COMMANDS=()=>[...FLAT.map(p=>({g:'Go to',l:p.l,i:p.i,run:()=>go(p.k)})),
 {g:'Actions',l:'Run inventory monitoring',i:'play',run:()=>{closePalette();runMon(false)}},{g:'Actions',l:'Run periodic review',i:'refresh',run:()=>{closePalette();runMon(true)}},
 {g:'Actions',l:'Run stock-health analysis',i:'heart',run:()=>{closePalette();act(()=>api('/stock-health/run',{}),r=>r.flagged+' items flagged')}},{g:'Actions',l:'Advance clock +24h & run timers',i:'clock',run:()=>{closePalette();adv(24)}},
 {g:'Actions',l:'Toggle dark / light theme',i:'moon',run:()=>{closePalette();toggleTheme()}},{g:'Actions',l:'Open assistant',i:'spark',run:()=>{closePalette();toggleChat(true)}}];
function openPalette(){if($('#cmdk'))return;const o=document.createElement('div');o.className='ov';o.id='cmdk';o.innerHTML=`<div class="pal"><div class="pin">${ic('search')}<input id="pq" placeholder="Type a page, action, or ask the AI…" autocomplete="off"></div><div class="res" id="pres"></div></div>`;document.body.append(o);o.onclick=e=>{if(e.target===o)closePalette()};const i=$('#pq');i.focus();i.oninput=()=>{palIdx=0;drawPal()};i.onkeydown=e=>{if(e.key==='ArrowDown'){palIdx=Math.min(palItems.length-1,palIdx+1);drawPal();e.preventDefault()}if(e.key==='ArrowUp'){palIdx=Math.max(0,palIdx-1);drawPal();e.preventDefault()}if(e.key==='Enter'&&palItems[palIdx])palItems[palIdx].run();if(e.key==='Escape')closePalette()};drawPal()}
function closePalette(){$('#cmdk')?.remove()}
function drawPal(){const q=($('#pq').value||'').trim(),ql=q.toLowerCase();palItems=COMMANDS().filter(c=>!ql||c.l.toLowerCase().includes(ql));if(q)palItems.push({g:'Ask AI',l:`Ask: “${q}”`,i:'spark',run:()=>{closePalette();toggleChat(true);say(q)}});
  let last='';$('#pres').innerHTML=palItems.map((c,i)=>{const h=c.g!=last?`<div class="g">${c.g}</div>`:'';last=c.g;return `${h}<div class="it ${i==palIdx?'on':''}" onmouseenter="palIdx=${i};drawPal()" onclick="palItems[${i}].run()"><div class="ico">${ic(c.i,16)}</div>${esc(c.l)}</div>`}).join('')||'<div class="empty">No results</div>'}
document.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();$('#cmdk')?closePalette():openPalette()}if(e.key==='Escape'&&$('#cw').classList.contains('open')&&!$('#cmdk')&&!document.querySelector('.ov'))toggleChat(false)});

/* ---------- chat assistant ---------- */
const SUGG=['What is low on stock at my store?','Show pending recommendations','Forecast for Trail Runner 2 size 9','Approve the reorder for Trail Runner 2 size 10','Where is PO-1?','Show overstock items','Set the reorder threshold for Coast Slide size 8 to 12'];
const CAPS=[['search','Ask','“What’s low at Dallas?”'],['check','Decide','“Approve RR-6”'],['trend','Forecast','“Demand for Aero Trainer 9?”'],['truck','Track','“Status of PO-3?”']];
const md=t=>esc(t).replace(/\*\*(.+?)\*\*/g,'<b>$1</b>').replace(/\b(RR|REQ|PO|DS)-(\d+)\b/g,'<span class="ref">$1-$2</span>');
const bubble=(r,t,tools)=>`<div class="msg ${r}">${r=='bot'?md(t):esc(t)}${tools?.length?`<div class="tools">${tools.map(x=>`<span class="tchip ${x.ok?'':'err'}">${ic(x.ok?'check':'alert',11)}${esc(x.tool.replace(/_/g,' '))}</span>`).join('')}</div>`:''}</div>`;
const scrollChat=()=>{const c=$('#cmsgs');c.scrollTop=c.scrollHeight};
async function loadChat(){const h=await api('/chat/history?manager='+mgr().manager_id);$('#cwho').textContent=`${mgr().manager_name} · ${META.llm||'fallback mode'}`;
  $('#cmsgs').innerHTML=h.flatMap(m=>[bubble('me',m.message_text),m.reply_text?bubble('bot',m.reply_text):'']).join('')||`<div class="welcome"><div class="wi">${ic('spark',28)}</div><h4>How can I help, ${esc(firstName(mgr().manager_name))}?</h4>I can check stock, run forecasts, track orders, and carry out your approvals — always asking before anything big.<div class="caps">${CAPS.map(c=>`<div class="cap" onclick="say('${c[2].replace(/[“”]/g,'').replace(/'/g,"\\'")}')"><b>${ic(c[0],14)}${c[1]}</b><span class="mut">${c[2]}</span></div>`).join('')}</div></div>`;
  $('#csug').innerHTML=SUGG.map(x=>`<span class="sug" onclick="say(this.textContent)">${esc(x)}</span>`).join('');scrollChat()}
function toggleChat(force){const w=$('#cw'),open=force===undefined?!w.classList.contains('open'):force;w.classList.toggle('open',open);if(open){loadChat();setTimeout(()=>$('#ci').focus(),300)}}
async function say(t){const i=$('#ci');t=(typeof t==='string'&&t)||i.value.trim();if(!t)return;const c=$('#cmsgs');c.querySelector('.welcome')?.remove();c.insertAdjacentHTML('beforeend',bubble('me',t)+`<div class="msg bot" id="typing"><span class="dots"><i></i><i></i><i></i></span></div>`);scrollChat();i.value='';
  try{const r=await api('/chat',{managerId:mgr().manager_id,storeId:myStore(),text:t});$('#typing').outerHTML=bubble('bot',r.reply,r.tools);scrollChat();if(r.tools?.some(x=>!['query_inventory','list_pending','get_forecast','get_order_status','get_requisition','list_stock_flags'].includes(x.tool)))render(true)}
  catch(e){$('#typing').innerHTML='⚠ '+esc(e.message)}}
boot();
