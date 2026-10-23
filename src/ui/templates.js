/** MCP Apps style UI templates, served as `ui://` resources with MIME type
 *  `text/html;profile=mcp-app`.
 *
 *  Contract with the host (see src/ui/app.js):
 *    iframe -> host : {jsonrpc:"2.0",method:"ui/ready",params:{protocol}}
 *    host   -> frame: {jsonrpc:"2.0",method:"ui/render",params:{cards|trace, title}}
 *    frame  -> host : {jsonrpc:"2.0",method:"ui/size-changed",params:{height}}
 *
 *  Fully self-contained: no external scripts, no third-party artwork, no fonts.
 */

const BASE_CSS = `
:root{--bg:#0e1620;--card:#16222f;--ink:#eaf2fa;--dim:#8fa6bd;--accent:#00c8ff;--ring:#1f3550}
*{box-sizing:border-box}
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:transparent;color:var(--ink)}
.wrap{padding:14px}
h2{font-size:14px;margin:0 0 12px;color:var(--dim);text-transform:uppercase;letter-spacing:.03em}
.empty{color:var(--dim);font-size:13px;padding:16px}
`;

const BRIDGE_JS = `
function report(){const h=document.body.scrollHeight;parent.postMessage({jsonrpc:"2.0",method:"ui/size-changed",params:{height:h+28}},'*');}
window.addEventListener('message',(e)=>{const m=e.data;if(m&&m.method==='ui/render'){window.__data=m.params;render(window.__data);}});
parent.postMessage({jsonrpc:"2.0",method:"ui/ready",params:{protocol:"mcp-app/0.1",template:document.documentElement.dataset.template}},'*');
window.addEventListener('load',()=>{report();setTimeout(report,80);});
`;

function doc(template, css, renderBody, body = '<div class="wrap" id="root"><p class="empty">Waiting for Aura to send data…</p></div>') {
  return `<!doctype html>
<html lang="en" data-template="${template}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>${BASE_CSS}${css}</style></head>
<body>${body}
<script>
const esc=(s)=>String(s??'').replace(/[&<>"']/g,(c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function render(d){
  const root=document.getElementById('root');
  if(!d) return;
  root.innerHTML = (${renderBody})(d);
  report();
}
${BRIDGE_JS}
</script></body></html>`;
}

/** Cards: hero tiles, headline lists and a horizontally scrolling media carousel. */
export const CARDS_TEMPLATE = doc(
  'aura-cards',
  `.row{display:flex;gap:12px;overflow-x:auto;padding-bottom:10px;scroll-snap-type:x mandatory}
  .card{flex:0 0 auto;width:152px;background:var(--card);border:1px solid var(--ring);border-radius:14px;padding:10px;scroll-snap-align:start}
  .card.chosen{border-color:var(--accent);box-shadow:0 0 0 2px rgba(0,200,255,.22)}
  .art{height:94px;border-radius:9px;background:linear-gradient(135deg,#1c3550,#0d2438);display:flex;align-items:center;justify-content:center;font-size:30px;color:#5fd8ff;margin-bottom:8px;overflow:hidden}
  .art img{width:100%;height:100%;object-fit:cover}
  .t{font-size:13px;font-weight:600;line-height:1.25}
  .s{font-size:11px;color:var(--dim);margin-top:3px;line-height:1.3}
  .p{font-size:12px;color:var(--accent);margin-top:6px}
  .tag{display:inline-block;font-size:10px;padding:2px 7px;border-radius:999px;background:#0d2438;color:#7fd8ff;margin-top:6px}
  .tile{background:var(--card);border:1px solid var(--ring);border-radius:14px;padding:13px;margin-bottom:10px}
  .tile .body{font-size:14px;line-height:1.45;margin:6px 0 0}
  .tile .meta{font-size:11px;color:var(--dim);margin-top:8px}
  ul.list{list-style:none;padding:0;margin:0 0 10px}
  ul.list li{padding:9px 0;border-bottom:1px solid var(--ring);font-size:13px}
  ul.list li:last-child{border:0}
  ul.list small{display:block;color:var(--dim);font-size:11px;margin-top:2px}
  .say{background:#0d2438;border-left:3px solid var(--accent);padding:10px 12px;border-radius:0 10px 10px 0;font-size:13px;line-height:1.5;margin-bottom:12px}`,
  `(d)=>{
  const cards=(d.cards||[]).map((c)=>{
    if(c.type==='carousel'){
      return '<h2>'+esc(c.title)+'</h2><div class="row">'+ (c.items||[]).map((i)=>
        '<div class="card'+(i.chosen?' chosen':'')+'"><div class="art"><img src="'+esc(i.art)+'" alt=""></div>'
        +'<div class="t">'+esc(i.title)+'</div><div class="s">'+esc(i.sub)+'</div>'
        +'<div class="p">'+(i.price?'$'+esc(i.price):'')+(i.chosen?' <span class=tag>agent pick</span>':'')+'</div></div>').join('')+'</div>';
    }
    if(c.type==='list'){
      return '<h2>'+esc(c.title)+'</h2><ul class="list">'+(c.items||[]).map((i)=>'<li>'+esc(i.title)+'<small>'+esc(i.sub)+'</small></li>').join('')+'</ul>';
    }
    return '<div class="tile"><div class="t">'+esc(c.title)+'</div><div class="body">'+esc(c.body)+'</div><div class="meta">'+esc(c.meta)+'</div></div>';
  }).join('');
  return '<div class="wrap">'+cards+'</div>';
}`
);

/** Plan timeline: shows the agent's steps and every re-plan it made. */
export const PLAN_TEMPLATE = doc(
  'aura-plan',
  `ol{list-style:none;margin:0;padding:0 0 0 4px}
  li{position:relative;padding:0 0 15px 22px;border-left:2px solid var(--ring);margin-left:6px}
  li:last-child{border-left-color:transparent}
  li:before{content:"";position:absolute;left:-7px;top:3px;width:12px;height:12px;border-radius:50%;background:#25415f;border:2px solid var(--bg)}
  li.ok:before{background:#25d07a}
  li.added-by-agent:before{background:var(--accent)}
  li.skipped:before{background:#f0a92a}
  li.error:before{background:#ff5c5c}
  li.needs_confirmation:before,.placed:before{background:#25d07a}
  .tool{font-size:13px;font-weight:600;font-family:ui-monospace,Menlo,Consolas,monospace}
  .why{font-size:12px;color:var(--dim);margin-top:2px;line-height:1.4}
  .sum{font-size:12px;margin-top:4px;color:#bfe3ff}
  .badge{font-size:10px;text-transform:uppercase;letter-spacing:.04em;color:var(--dim);float:right}
  .verdict{background:var(--card);border:1px solid var(--ring);border-radius:12px;padding:12px;font-size:13px;line-height:1.45;margin-top:8px}`,
  `(d)=>{
  const rows=(d.trace||[]).map((s)=>'<li class="'+esc(s.status)+'"><span class="badge">'+esc(s.status)+(s.ms?' · '+s.ms+'ms':'')+'</span>'
    +'<div class="tool">'+esc(s.tool)+'</div><div class="why">'+esc(s.why||'')+'</div>'
    +(s.error?'<div class="why" style="color:#ff8f8f">'+esc(s.error)+'</div>':'')
    +(s.summary?'<div class="sum">'+esc(s.summary)+'</div>':'')+'</li>').join('');
  const verdict=d.spoken?'<div class="verdict"><b>What Aura said</b><br>'+esc(d.spoken)+'</div>':'';
  return '<div class="wrap"><h2>Agent plan · '+esc(d.title||'')+'</h2><ol>'+rows+'</ol>'+verdict+'</div>';
}`
);

/** Decision summary: routine name, tool sequence, re-plan and skipped steps with their reasons,
 *  and the spend-cap block. Handles both trace-backed and legacy (no trace) routines. */
export const DECISION_TEMPLATE = doc(
  'aura-decision',
  `.hero{background:var(--card);border:1px solid var(--ring);border-radius:14px;padding:14px;margin-bottom:14px}
  .hero .name{font-size:15px;font-weight:700;line-height:1.3}
  .hero .meta{font-size:11px;color:var(--dim);margin-top:4px}
  .hero .chosen{font-size:13px;color:var(--accent);margin-top:6px}
  .section{margin-bottom:14px}
  .section h2{font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:var(--dim);margin:0 0 8px}
  ol.tools{list-style:none;padding:0;margin:0;counter-reset:t}
  ol.tools li{counter-increment:t;padding:7px 0 7px 28px;border-bottom:1px solid var(--ring);font-size:13px;font-family:ui-monospace,Menlo,Consolas,monospace;position:relative}
  ol.tools li:last-child{border:0}
  ol.tools li:before{content:counter(t);position:absolute;left:0;top:7px;width:20px;height:20px;background:#1f3550;border-radius:50%;font-size:10px;display:flex;align-items:center;justify-content:center;color:var(--dim)}
  .badge-row{display:flex;gap:8px;flex-wrap:wrap;margin-top:4px}
  .badge{display:inline-flex;align-items:center;gap:5px;font-size:11px;padding:3px 9px;border-radius:999px;background:#0d2438;color:#7fd8ff;border:1px solid var(--ring)}
  .badge.warn{color:#f0a92a;border-color:#f0a92a44;background:#1a1200}
  .badge.ok{color:#25d07a;border-color:#25d07a44;background:#001a0a}
  .badge.blocked{color:#ff5c5c;border-color:#ff5c5c44;background:#1a0000}
  .badge.info{color:#aac8ff;border-color:#3358aa44;background:#0a1030}
  .block-row{background:var(--card);border:1px solid #ff5c5c44;border-radius:12px;padding:12px;font-size:13px;line-height:1.45}
  .block-row .label{font-size:11px;text-transform:uppercase;color:#ff5c5c;margin-bottom:4px;letter-spacing:.03em}
  .step-list{list-style:none;padding:0;margin:0}
  .step-list li{padding:8px 0 8px 14px;border-left:3px solid var(--ring);margin-bottom:8px;border-radius:0 8px 8px 0;background:#11202f}
  .step-list li.added{border-left-color:var(--accent)}
  .step-list li.skipped{border-left-color:#f0a92a}
  .step-tool{font-size:12px;font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:600;color:#bfe3ff}
  .step-why{font-size:12px;color:var(--dim);margin-top:2px;line-height:1.4}
  .no-trace{background:#0d1e2f;border:1px solid #f0a92a44;border-radius:10px;padding:11px;font-size:12px;color:#f0a92a;line-height:1.5}
  .none{color:var(--dim);font-size:12px;font-style:italic}`,
  `(d)=>{
  if(!d||!d.found){return '<div class="wrap"><p class="empty">'+esc(d&&d.reason||'No data yet.')+'</p></div>';}

  const hero='<div class="hero">'
    +'<div class="name">'+esc(d.routineName)+'</div>'
    +'<div class="meta">'+esc(d.committedAt?d.committedAt.replace('T',' ').slice(0,16)+' UTC':'')
    +(d.routineId?' · id '+esc(d.routineId):'')+'</div>'
    +(d.chosen?'<div class="chosen">Chosen: '+esc(d.chosen)+'</div>':'')
    +'</div>';

  // No trace available (legacy routine committed before trace storage was introduced)
  if(!d.traceAvailable){
    const flags=[];
    if(d.purchaseBlocked) flags.push('<span class="badge blocked">🚫 purchase blocked by spend cap</span>');
    else if(d.spend>0) flags.push('<span class="badge ok">✓ purchase within cap ('+esc(String(d.spend))+' USD)</span>');
    const blockSection=d.purchaseBlocked
      ?'<div class="section"><h2>Spend-cap block</h2><div class="block-row"><div class="label">blocked</div>'+esc(d.blockedDetail||'')+'</div></div>'
      :'';
    return '<div class="wrap">'+hero
      +'<div class="section"><div class="no-trace">⚠ This routine was committed before per-step trace storage was introduced. '
      +(d.reason||'Tool sequence and re-plan details are not available.')+'</div></div>'
      +(flags.length?'<div class="section"><h2>Decision flags</h2><div class="badge-row">'+flags.join('')+'</div></div>':'')
      +blockSection
      +(d.summary?'<div class="section"><h2>Committed summary</h2><div style="font-size:13px;line-height:1.5;color:#bfe3ff">'+esc(d.summary)+'</div></div>':'')
      +'</div>';
  }

  // Trace-backed rendering: exact values from stored trace.
  const toolList=(d.toolsInOrder||[]);
  const tools=toolList.length
    ?'<ol class="tools">'+toolList.map((t)=>'<li>'+esc(t)+'</li>').join('')+'</ol>'
    :'<p class="none">No tools recorded in trace.</p>';

  // Re-plan steps: each has tool + why
  const added=(d.addedByAgent||[]);
  const addedHtml=added.length
    ?'<ul class="step-list">'+added.map((s)=>'<li class="added"><div class="step-tool">+ '+esc(s.tool)+'</div><div class="step-why">'+esc(s.why||'')+'</div></li>').join('')+'</ul>'
    :'<p class="none">No agent-added steps.</p>';

  // Skipped steps: each has tool + reason
  const skipped=(d.skippedSteps||[]);
  const skippedHtml=skipped.length
    ?'<ul class="step-list">'+skipped.map((s)=>'<li class="skipped"><div class="step-tool">⏭ '+esc(s.tool)+'</div><div class="step-why">'+esc(s.reason||'')+'</div></li>').join('')+'</ul>'
    :'<p class="none">No skipped steps.</p>';

  const flags=[];
  if(added.length) flags.push('<span class="badge warn">⚡ '+added.length+' re-plan step'+(added.length!==1?'s':'')+'</span>');
  if(skipped.length) flags.push('<span class="badge warn">⏭ '+skipped.length+' skipped step'+(skipped.length!==1?'s':'')+'</span>');
  if(d.purchaseBlocked) flags.push('<span class="badge blocked">🚫 purchase blocked by spend cap</span>');
  else if(d.spend>0) flags.push('<span class="badge ok">✓ purchase within cap ('+esc(String(d.spend))+' USD)</span>');
  const badgeRow=flags.length?'<div class="badge-row">'+flags.join('')+'</div>':'<p class="none">No flags.</p>';

  const blockSection=d.purchaseBlocked
    ?'<div class="section"><h2>Spend-cap block</h2><div class="block-row"><div class="label">blocked</div>'+esc(d.blockedDetail||'')+'</div></div>'
    :'';

  const summarySection=d.summary
    ?'<div class="section"><h2>Committed summary</h2><div style="font-size:13px;line-height:1.5;color:#bfe3ff">'+esc(d.summary)+'</div></div>'
    :'';

  return '<div class="wrap">'
    +hero
    +'<div class="section"><h2>Tools in order</h2>'+tools+'</div>'
    +'<div class="section"><h2>Agent re-plan steps</h2>'+addedHtml+'</div>'
    +'<div class="section"><h2>Skipped steps</h2>'+skippedHtml+'</div>'
    +'<div class="section"><h2>Decision flags</h2>'+badgeRow+'</div>'
    +blockSection
    +summarySection
    +'</div>';
}`
);

/** Deterministic poster so the demo never needs third-party artwork. */
export function poster(title = 'Aura') {
  const initials = title.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
  const safe = initials.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1c3550"/><stop offset="1" stop-color="#0d2438"/></linearGradient></defs><rect width="300" height="300" rx="10" fill="url(#g)"/><text x="150" y="172" font-family="system-ui,sans-serif" font-size="72" fill="#5fd8ff" text-anchor="middle">${safe}</text></svg>`;
}
