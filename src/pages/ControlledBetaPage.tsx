import {useEffect,useMemo,useState} from 'react';
import {Logo} from '@/components/chrome/Logo';
import {controlledBetaSchema,betaReason,betaEvidenceReason,type ControlledBetaArtifact,type BetaPlayer} from '@/contracts/controlledBeta';
import {ageHours,classifyFreshness,STALENESS} from '@/contracts/freshness';
import {useFreshnessClock} from '@/components/data/FreshnessNote';

function EvidenceDetails({player:p}:{player:BetaPlayer}) {
  return <details className="mt-3 border-t border-border-default pt-2">
    <summary className="min-h-[44px] cursor-pointer py-3 text-sm text-brand-blue focus-visible:outline focus-visible:outline-2">Evidence and explanation for {p.name}</summary>
    <div className="space-y-2 pb-3 text-sm leading-relaxed text-text-muted">
      <p>{betaReason(p.terminalCategory)} This does not mean the player has zero dynasty value.</p>
      <p>{p.reasons.map(betaEvidenceReason).join(' ')}</p>
      {p.selected&&<p>Model path evaluated: {p.baselineTier==='FULL'?'full QB model':p.baselineTier==='ACCESSIBLE'?'accessible-data model': 'no supported value produced'}. {p.baselineOutcome==='legitimate_insufficient'?'The underlying model also returned a legitimate insufficient-evidence outcome.':'Diagnostic model numbers are withheld, not promoted to approved values.'}</p>}
      <p>Historical performance retained: {p.historical.games} recorded regular-season games{p.historical.fromSeason!==null?` (${p.historical.fromSeason}–${p.historical.throughSeason})`:''}. These are recorded appearances, not the number of team opportunities.</p>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[['Passing yards',p.historical.passingYards],['Rushing yards',p.historical.rushingYards],['Receiving yards',p.historical.receivingYards],['Targets',p.historical.targets]].map(([label,value])=><div key={String(label)}><dt className="text-xs">{label}</dt><dd className="data text-text-secondary">{value===null?'Unknown':value}</dd></div>)}
      </dl>
      <p>Roster observation: {p.rosterStatus??'unknown raw status'}{p.rosterWeek!==null?`, week ${p.rosterWeek}`:''}; team {p.team??'unknown'}. This is not a continuous tenure, injury diagnosis or positive current-role attestation. Availability remains unverified.</p>
      <p className="break-all text-xs">{p.canonicalId?`Canonical identity: ${p.canonicalId}`:'Canonical identity unresolved; this record is audit-only.'}</p>
    </div>
  </details>;
}

export function ControlledBetaView({artifact:a}:{artifact:ControlledBetaArtifact}){
  const [query,setQuery]=useState(''),[position,setPosition]=useState('ALL'),[scope,setScope]=useState('selected');
  const now=useFreshnessClock();
  const age=ageHours(a.evidenceObservedAt,now),freshness=classifyFreshness(a.evidenceObservedAt,now,STALENESS.boardCurrentHours,STALENESS.boardExpiredHours);
  const rows=useMemo(()=>a.players.filter(p=>(scope==='all'||(scope==='selected'?p.selected:!p.selected))&&(position==='ALL'||p.position===position)&&(`${p.name} ${p.team??''} ${p.canonicalId??''}`.toLowerCase().includes(query.trim().toLowerCase()))).sort((x,y)=>x.name.localeCompare(y.name)||x.id.localeCompare(y.id)),[a,query,position,scope]);
  const selected=a.players.filter(p=>p.selected).length;
  return <div className="min-h-screen bg-canvas text-text-primary">
    <a href="#beta-main" className="sr-only focus:not-sr-only">Skip to board</a>
    <header className="border-b border-border-default bg-surface"><div className="mx-auto flex max-w-app flex-wrap items-center justify-between gap-3 px-5 py-5"><Logo size={28}/><span className="rounded-control border border-warning/40 px-3 py-2 text-xs text-warning">PRIVATE CONTROLLED BETA · NOT PUBLISHED</span></div></header>
    <main id="beta-main" className="mx-auto max-w-app px-4 py-6 sm:px-8">
      <p className="eyebrow text-brand-blue">REAL CAPTURED EVIDENCE</p><h1 className="mt-2 text-3xl font-bold tracking-tight">The weekly dynasty board</h1>
      <p className="mt-2 text-text-secondary">12-team Dynasty · Superflex · Full PPR</p>
      <div className="my-5 rounded-card border border-warning/40 bg-warning/5 p-4 text-sm leading-relaxed" role="note">
        <strong>Values are not yet supported for this capture.</strong> Review the player evidence and coverage below. Current-role continuity is unverified, so no diagnostic values, confidence scores or ranks are presented as valuations. Historical production is preserved. No external market data is included.
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {[['Roster-observed candidates',a.players.length],['Selected for inference',selected],['Eligible numerical values',0]].map(([label,value])=><div className="rounded-card border border-border-default bg-surface p-4" key={label}><p className="text-xs text-text-muted">{label}</p><p className="data mt-1 text-3xl font-semibold">{value}</p></div>)}
      </div>
      <section className="my-5 space-y-2 text-xs leading-relaxed text-text-muted" aria-label="Evidence dates and coverage">
        <p>Model/evidence as-of: <time dateTime={a.modelAsOf}>{a.modelAsOf}</time>. Captured evidence observed: <time dateTime={a.evidenceObservedAt}>{a.evidenceObservedAt}</time>.</p>
        <p>Preview generated: <time dateTime={a.generatedAt}>{a.generatedAt}</time>. Production publication: none.</p>
        <p aria-live="polite">Evidence age: {age===null?'unknown':`${age.toFixed(1)} hours`} · {freshness}. Loading this page does not refresh football evidence.</p>
        <p>Completed regular-season weeks confirmed: {a.completedWeeks.join(', ')||'none'}. Partial weeks present: {a.partialWeeks.join(', ')||'none'}. {a.finalGames} final games confirmed by captured end-game records; no exact ending timestamps invented.</p>
        <p>Required source coordinates: {a.sourcePlanComplete?'complete':'incomplete'}. Inference: {a.inferenceComplete?'complete':'incomplete'}. Current-role reference coverage: incomplete. Full QB and accessible RB/WR/TE paths retain their different input limitations.</p>
      </section>
      <details className="mb-5 rounded-card border border-border-default bg-surface p-4"><summary className="cursor-pointer py-2 text-sm font-semibold">Coverage by position and why values are withheld</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-4">{Object.entries(a.coverage).map(([pos,c])=><div key={pos}><h2 className="font-semibold">{pos}</h2><p className="text-sm">{c.selected} selected · {c.numerically_eligible??0} eligible</p><p className="text-xs text-text-muted">{c.blocked_reference_coverage??0} reference blocks · {c.legitimate_insufficient??0} terminal insufficient · {(c.held_expired_role??0)+(c.held_unknown_role??0)} role holds · {(c.failed_inference??0)+(c.unsupported_model_path??0)+(c.blocked_source_coverage??0)} other blocks</p></div>)}</div>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-sm text-text-muted">{a.limitations.map(x=><li key={x}>{x}</li>)}</ul>
      </details>
      <div className="mb-4 flex flex-wrap items-end gap-3 border-y border-border-default py-4">
        <label className="min-w-[180px] flex-1 text-xs text-text-muted">Search players<input className="mt-1 block min-h-[44px] w-full rounded-control border border-border-default bg-surface px-3 text-sm text-text-primary" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Name, team or canonical ID"/></label>
        <label className="text-xs text-text-muted">Position<select className="mt-1 block min-h-[44px] rounded-control border border-border-default bg-surface px-3 text-sm text-text-primary" value={position} onChange={e=>setPosition(e.target.value)}>{['ALL','QB','RB','WR','TE'].map(p=><option key={p} value={p}>{p==='ALL'?'All positions':p}</option>)}</select></label>
        <label className="text-xs text-text-muted">Population<select className="mt-1 block min-h-[44px] rounded-control border border-border-default bg-surface px-3 text-sm text-text-primary" value={scope} onChange={e=>setScope(e.target.value)}><option value="selected">Selected players</option><option value="excluded">Not selected · audit only</option><option value="all">All roster-observed candidates</option></select></label>
      </div>
      <p role="status" className="mb-3 text-xs text-text-muted">Showing {rows.length} players · alphabetical, unranked · “—” means unavailable, not zero</p>
      <div className="grid gap-3 lg:grid-cols-2">{rows.map(p=><article key={p.id} className="min-w-0 rounded-card border border-border-default bg-surface p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-semibold">{p.name}</h2><p className="mt-1 text-xs text-text-muted">{p.position} · {p.team??'Team unconfirmed'} · {p.selected?'Selected for evaluation':'Audit candidate · not admitted'}</p></div><div className="shrink-0 text-right"><p className="data text-xl" aria-label={`No supported value for ${p.name}`}>—</p><p className="text-[10px] text-text-muted">Dynasty value / rank</p></div></div>
        <p className="mt-3 text-xs text-text-secondary">{betaReason(p.terminalCategory)}</p><EvidenceDetails player={p}/>
      </article>)}</div>
      {!rows.length&&<p className="py-12 text-center">No players match these filters.</p>}
      <footer className="mt-8 border-t border-border-default pt-4 text-xs leading-relaxed text-text-muted"><p>Private evidence review only. Provisional role rules are not production methodology or predictive validation. Player names and statistics are factual observations, without NFL marks or licensed images.</p><p className="mt-2 break-all">Artifact {a.artifactId} · {a.configurationId} · code {a.codeIdentity.sha}</p></footer>
    </main>
  </div>;
}

export default function ControlledBetaPage(){
  const [artifact,setArtifact]=useState<ControlledBetaArtifact|null>(null),[error,setError]=useState(false);
  useEffect(()=>{const controller=new AbortController();fetch(`${import.meta.env.BASE_URL}__controlled-beta/evaluation.json`,{signal:controller.signal,cache:'no-store'}).then(async r=>{if(!r.ok)throw Error('unavailable');return controlledBetaSchema.parse(await r.json());}).then(setArtifact).catch(()=>{if(!controller.signal.aborted)setError(true);});return()=>controller.abort();},[]);
  if(error)return <main className="mx-auto max-w-3xl p-8"><Logo/><h1 className="mt-8 text-2xl font-bold">Controlled preview unavailable</h1><p className="mt-3">Start the local preview with its validated evaluation artifact. No demo values or last-good production board have been substituted.</p></main>;
  if(!artifact)return <main className="p-8" role="status">Loading captured evaluation…</main>;
  return <ControlledBetaView artifact={artifact}/>;
}
