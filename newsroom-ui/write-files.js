const fs = require('fs')

fs.writeFileSync('src/lib/supabase.ts', `import { createClient } from '@supabase/supabase-js'
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
export const supabase = createClient(supabaseUrl, supabaseAnonKey)
export type Role = 'editor' | 'reporter'
export interface Reporter { id: string; name: string; email: string; beats: string[]; max_stories_per_week: number; status: string; created_at: string }
export interface Story { id: string; headline: string; category: string; complexity: number; urgency: 'breaking'|'high'|'normal'|'low'; priority: number; status: string; deadline: string; description?: string; created_by?: string; created_at: string }
export interface LeaveRequest { id: string; reporter_id: string; leave_date: string; leave_type: 'planned'|'sick'|'emergency'; is_immediate: boolean; status: string; notes?: string; created_at: string }
`)

fs.writeFileSync('src/pages/Login.tsx', `import { useState } from 'react'
import { supabase } from '../lib/supabase'
export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [mode, setMode] = useState('signin')
  const [signupRole, setSignupRole] = useState('reporter')
  const [name, setName] = useState('')
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message)
    } else {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { role: signupRole, name } } })
      if (error) { setError(error.message); setLoading(false); return }
      if (data.user) {
        const { data: reporter } = await supabase.from('reporters').insert({ name: name || email.split('@')[0], email, beats: [], max_stories_per_week: 4, status: 'active' }).select().single()
        if (reporter) await supabase.from('profiles').upsert({ id: data.user.id, reporter_id: reporter.id, role: signupRole })
      }
    }
    setLoading(false)
  }
  const inp: React.CSSProperties = { width:'100%', padding:'12px 14px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'6px', color:'#fff', fontSize:'14px', outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
  const lbl: React.CSSProperties = { color:'#888', fontSize:'11px', letterSpacing:'1px', display:'block', marginBottom:'6px' }
  return (
    <div style={{minHeight:'100vh',background:'#0a0a0f',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'"DM Mono","Courier New",monospace'}}>
      <div style={{position:'relative',width:'100%',maxWidth:'400px',padding:'0 24px'}}>
        <div style={{marginBottom:'40px',textAlign:'center'}}>
          <div style={{display:'inline-flex',alignItems:'center',gap:'8px',background:'rgba(255,180,0,0.08)',border:'1px solid rgba(255,180,0,0.2)',borderRadius:'4px',padding:'6px 12px',marginBottom:'20px'}}>
            <div style={{width:'6px',height:'6px',borderRadius:'50%',background:'#ffb400'}}/>
            <span style={{color:'#ffb400',fontSize:'11px',letterSpacing:'2px'}}>NEWSROOM OS</span>
          </div>
          <h1 style={{color:'#fff',fontSize:'28px',fontWeight:'700',margin:'0 0 8px'}}>{mode==='signin'?'Sign in':'Create account'}</h1>
          <p style={{color:'#555',fontSize:'13px',margin:0}}>{mode==='signin'?'Access your newsroom dashboard':'Join the newsroom team'}</p>
        </div>
        <form onSubmit={handleSubmit} style={{display:'flex',flexDirection:'column',gap:'14px'}}>
          {mode==='signup'&&<div><label style={lbl}>FULL NAME</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Your name" style={inp}/></div>}
          <div><label style={lbl}>EMAIL</label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="you@newsroom.com" style={inp}/></div>
          <div><label style={lbl}>PASSWORD</label><input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••" style={inp}/></div>
          {mode==='signup'&&<div><label style={lbl}>ROLE</label><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px'}}>{(['reporter','editor'] as const).map(r=><button key={r} type="button" onClick={()=>setSignupRole(r)} style={{padding:'10px',borderRadius:'6px',border:'1px solid',borderColor:signupRole===r?'#ffb400':'rgba(255,255,255,0.1)',background:signupRole===r?'rgba(255,180,0,0.1)':'transparent',color:signupRole===r?'#ffb400':'#666',fontSize:'12px',cursor:'pointer',fontFamily:'inherit',textTransform:'uppercase'}}>{r}</button>)}</div></div>}
          {error&&<div style={{padding:'10px 14px',background:'rgba(255,60,60,0.1)',border:'1px solid rgba(255,60,60,0.3)',borderRadius:'6px',color:'#ff6b6b',fontSize:'13px'}}>{error}</div>}
          <button type="submit" disabled={loading} style={{padding:'13px',background:loading?'rgba(255,180,0,0.4)':'#ffb400',border:'none',borderRadius:'6px',color:'#0a0a0f',fontSize:'13px',fontWeight:'700',cursor:'pointer',fontFamily:'inherit'}}>{loading?'LOADING...':mode==='signin'?'SIGN IN':'CREATE ACCOUNT'}</button>
        </form>
        <p style={{textAlign:'center',color:'#555',fontSize:'13px',marginTop:'24px'}}>{mode==='signin'?"Don't have an account? ":"Already have an account? "}<button onClick={()=>{setMode(mode==='signin'?'signup':'signin');setError('')}} style={{background:'none',border:'none',color:'#ffb400',cursor:'pointer',fontFamily:'inherit',fontSize:'13px'}}>{mode==='signin'?'Sign up':'Sign in'}</button></p>
      </div>
    </div>
  )
}
`)

fs.writeFileSync('src/pages/EditorDashboard.tsx', `import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import AssignModal from '../components/AssignModal'
export default function EditorDashboard() {
  const [stories, setStories] = useState<any[]>([])
  const [alerts, setAlerts] = useState<any[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [assignStory, setAssignStory] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [form, setForm] = useState({ headline:'', category:'Politics', complexity:3, urgency:'normal', priority:3, deadline:'', description:'' })
  const BEATS = ['Politics','Economy','Tech','Science','Crime','Local','Sports','Entertainment','Business']
  const urgencyColor: Record<string,string> = { breaking:'#ff4444', high:'#ff8800', normal:'#ffb400', low:'#64c896' }
  const statusColor: Record<string,string> = { unassigned:'#555', assigned:'#ffb400', in_progress:'#64c896', filed:'#8888ff', published:'#aaa' }
  async function load() {
    setLoading(true)
    const { data: storiesData } = await supabase.from('stories').select('*').order('created_at', { ascending: false }).limit(20)
    const { data: assignments } = await supabase.from('assignments').select('story_id, reporters(name)').eq('is_active', true)
    const assignMap: Record<string,string> = {}
    assignments?.forEach((a: any) => { assignMap[a.story_id] = a.reporters?.name })
    setStories((storiesData || []).map(s => ({ ...s, reporter_name: assignMap[s.id] })))
    const { data: leaves } = await supabase.from('leave_requests').select('*, reporters(name)').eq('status', 'pending')
    setAlerts((leaves || []).map((l: any) => ({ ...l, reporter_name: l.reporters?.name })))
    setLoading(false)
  }
  useEffect(() => { load() }, [])
  async function createStory() {
    if (!form.headline || !form.deadline) return
    await supabase.from('stories').insert({ ...form, status: 'unassigned' })
    setShowCreate(false)
    setForm({ headline:'', category:'Politics', complexity:3, urgency:'normal', priority:3, deadline:'', description:'' })
    load()
  }
  async function acknowledgeLeave(id: string) {
    await supabase.from('leave_requests').update({ status:'acknowledged', acknowledged_at: new Date().toISOString() }).eq('id', id)
    load()
  }
  const stats = [
    { label:'Total Stories', value:stories.length, color:'#ffb400' },
    { label:'Unassigned', value:stories.filter(s=>s.status==='unassigned').length, color:'#ff6b6b' },
    { label:'In Progress', value:stories.filter(s=>s.status==='in_progress').length, color:'#64c896' },
    { label:'Leave Alerts', value:alerts.length, color:'#ff8800' },
  ]
  const inp: React.CSSProperties = { width:'100%', padding:'10px 12px', background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:'6px', color:'#fff', fontSize:'13px', outline:'none', boxSizing:'border-box', fontFamily:'inherit' }
  return (
    <div style={{minHeight:'100vh',background:'#0a0a0f',fontFamily:'"DM Mono","Courier New",monospace'}}>
      <Navbar/>
      <div style={{padding:'32px 24px',maxWidth:'1200px',margin:'0 auto'}}>
        <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'16px',marginBottom:'32px'}}>
          {stats.map(s=><div key={s.label} style={{padding:'20px',borderRadius:'6px',border:'1px solid rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.02)'}}><div style={{color:s.color,fontSize:'28px',fontWeight:'700',marginBottom:'4px'}}>{s.value}</div><div style={{color:'#555',fontSize:'11px',letterSpacing:'1px'}}>{s.label.toUpperCase()}</div></div>)}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 320px',gap:'24px'}}>
          <div>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
              <h2 style={{color:'#fff',margin:0,fontSize:'14px',letterSpacing:'1px'}}>RECENT STORIES</h2>
              <button onClick={()=>setShowCreate(true)} style={{padding:'8px 18px',background:'#ffb400',border:'none',borderRadius:'4px',color:'#0a0a0f',fontSize:'11px',letterSpacing:'1px',fontWeight:'700',cursor:'pointer',fontFamily:'inherit'}}>+ NEW STORY</button>
            </div>
            {loading?<div style={{color:'#555',textAlign:'center',padding:'40px'}}>Loading...</div>:(
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                {stories.map(story=>(
                  <div key={story.id} style={{padding:'16px',borderRadius:'6px',border:'1px solid rgba(255,255,255,0.06)',background:'rgba(255,255,255,0.02)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px',flexWrap:'wrap'}}>
                        <span style={{padding:'2px 6px',borderRadius:'3px',fontSize:'9px',letterSpacing:'1px',background:urgencyColor[story.urgency]+'20',color:urgencyColor[story.urgency]}}>{story.urgency.toUpperCase()}</span>
                        <span style={{padding:'2px 6px',borderRadius:'3px',fontSize:'9px',letterSpacing:'1px',background:statusColor[story.status]+'20',color:statusColor[story.status]}}>{story.status.replace('_',' ').toUpperCase()}</span>
                        <span style={{color:'#444',fontSize:'11px'}}>{story.category}</span>
                      </div>
                      <div style={{color:'#ddd',fontSize:'14px',marginBottom:'4px',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{story.headline}</div>
                      <div style={{color:'#555',fontSize:'11px'}}>Due {story.deadline}{story.reporter_name&&<span style={{color:'#888'}}> · {story.reporter_name}</span>}</div>
                    </div>
                    {story.status==='unassigned'&&<button onClick={()=>setAssignStory(story)} style={{padding:'8px 16px',background:'transparent',border:'1px solid rgba(255,180,0,0.4)',borderRadius:'4px',color:'#ffb400',fontSize:'11px',cursor:'pointer',fontFamily:'inherit',marginLeft:'16px',whiteSpace:'nowrap'}}>ASSIGN →</button>}
                  </div>
                ))}
                {stories.length===0&&<div style={{color:'#333',fontSize:'13px',textAlign:'center',padding:'40px',border:'1px dashed rgba(255,255,255,0.07)',borderRadius:'6px'}}>No stories yet. Create one!</div>}
              </div>
            )}
          </div>
          <div>
            <h2 style={{color:'#fff',margin:'0 0 16px',fontSize:'14px',letterSpacing:'1px'}}>LEAVE ALERTS</h2>
            {alerts.length===0?<div style={{color:'#555',fontSize:'12px',padding:'24px',textAlign:'center',border:'1px solid rgba(255,255,255,0.06)',borderRadius:'6px'}}>No pending alerts</div>:(
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                {alerts.map(a=>(
                  <div key={a.id} style={{padding:'14px',borderRadius:'6px',border:'1px solid rgba(255,136,0,0.2)',background:'rgba(255,136,0,0.04)'}}>
                    <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                      <span style={{color:'#ddd',fontSize:'13px',fontWeight:'600'}}>{a.reporter_name}</span>
                      <span style={{padding:'2px 6px',borderRadius:'3px',fontSize:'9px',background:'rgba(255,68,68,0.15)',color:'#ff6b6b'}}>{a.leave_type?.toUpperCase()}</span>
                    </div>
                    <div style={{color:'#666',fontSize:'11px',marginBottom:'10px'}}>{a.leave_date}</div>
                    <button onClick={()=>acknowledgeLeave(a.id)} style={{width:'100%',padding:'7px',background:'transparent',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'4px',color:'#888',fontSize:'10px',cursor:'pointer',fontFamily:'inherit'}}>ACKNOWLEDGE</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      {showCreate&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={e=>{if(e.target===e.currentTarget)setShowCreate(false)}}>
          <div style={{background:'#0d0d14',border:'1px solid rgba(255,180,0,0.2)',borderRadius:'8px',width:'100%',maxWidth:'480px',margin:'24px',padding:'24px',maxHeight:'90vh',overflowY:'auto',fontFamily:'"DM Mono","Courier New",monospace'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:'20px'}}><h2 style={{color:'#fff',margin:0,fontSize:'16px'}}>New Story</h2><button onClick={()=>setShowCreate(false)} style={{background:'none',border:'none',color:'#555',fontSize:'20px',cursor:'pointer'}}>×</button></div>
            <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
              <div><label style={{color:'#888',fontSize:'11px',letterSpacing:'1px',display:'block',marginBottom:'6px'}}>HEADLINE</label><input value={form.headline} onChange={e=>setForm(p=>({...p,headline:e.target.value}))} placeholder="Story headline..." style={inp}/></div>
              <div><label style={{color:'#888',fontSize:'11px',letterSpacing:'1px',display:'block',marginBottom:'6px'}}>DEADLINE</label><input type="date" value={form.deadline} onChange={e=>setForm(p=>({...p,deadline:e.target.value}))} style={{...inp,colorScheme:'dark'}}/></div>
              <div><label style={{color:'#888',fontSize:'11px',letterSpacing:'1px',display:'block',marginBottom:'6px'}}>DESCRIPTION</label><textarea value={form.description} onChange={e=>setForm(p=>({...p,description:e.target.value}))} rows={3} style={{...inp,resize:'none'}}/></div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                <div><label style={{color:'#888',fontSize:'11px',letterSpacing:'1px',display:'block',marginBottom:'6px'}}>CATEGORY</label><select value={form.category} onChange={e=>setForm(p=>({...p,category:e.target.value}))} style={{...inp,background:'#0d0d14'}}>{BEATS.map(b=><option key={b}>{b}</option>)}</select></div>
                <div><label style={{color:'#888',fontSize:'11px',letterSpacing:'1px',display:'block',marginBottom:'6px'}}>URGENCY</label><select value={form.urgency} onChange={e=>setForm(p=>({...p,urgency:e.target.value}))} style={{...inp,background:'#0d0d14'}}>{ ['breaking','high','normal','low'].map(u=><option key={u}>{u}</option>)}</select></div>
                <div><label style={{color:'#888',fontSize:'11px',letterSpacing:'1px',display:'block',marginBottom:'6px'}}>COMPLEXITY (1-5)</label><input type="number" min={1} max={5} value={form.complexity} onChange={e=>setForm(p=>({...p,complexity:+e.target.value}))} style={inp}/></div>
                <div><label style={{color:'#888',fontSize:'11px',letterSpacing:'1px',display:'block',marginBottom:'6px'}}>PRIORITY (1-5)</label><input type="number" min={1} max={5} value={form.priority} onChange={e=>setForm(p=>({...p,priority:+e.target.value}))} style={inp}/></div>
              </div>
              <button onClick={createStory} style={{padding:'13px',background:'#ffb400',border:'none',borderRadius:'6px',color:'#0a0a0f',fontSize:'12px',letterSpacing:'1px',fontWeight:'700',cursor:'pointer',fontFamily:'inherit'}}>CREATE STORY</button>
            </div>
          </div>
        </div>
      )}
      {assignStory&&<AssignModal story={assignStory} onClose={()=>setAssignStory(null)} onAssigned={load}/>}
    </div>
  )
}
`)

fs.writeFileSync('src/pages/KanbanBoard.tsx', `import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
import AssignModal from '../components/AssignModal'
const COLUMNS = [{key:'unassigned',label:'UNASSIGNED',color:'#555'},{key:'assigned',label:'ASSIGNED',color:'#ffb400'},{key:'in_progress',label:'IN PROGRESS',color:'#64c896'},{key:'filed',label:'FILED',color:'#8888ff'},{key:'published',label:'PUBLISHED',color:'#aaa'}]
const urgencyColor: Record<string,string> = { breaking:'#ff4444', high:'#ff8800', normal:'#ffb400', low:'#64c896' }
export default function KanbanBoard() {
  const [stories, setStories] = useState<any[]>([])
  const [assignMap, setAssignMap] = useState<Record<string,string>>({})
  const [assignStory, setAssignStory] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  async function load() {
    const { data } = await supabase.from('stories').select('*').order('priority',{ascending:false})
    const { data: assignments } = await supabase.from('assignments').select('story_id, reporters(name)').eq('is_active',true)
    const map: Record<string,string> = {}
    assignments?.forEach((a:any)=>{ map[a.story_id]=a.reporters?.name })
    setAssignMap(map); setStories(data||[]); setLoading(false)
  }
  useEffect(()=>{load()},[])
  return (
    <div style={{minHeight:'100vh',background:'#0a0a0f',fontFamily:'"DM Mono","Courier New",monospace'}}>
      <Navbar/>
      <div style={{padding:'24px',overflowX:'auto'}}>
        <div style={{display:'flex',gap:'16px',minWidth:COLUMNS.length*260+'px'}}>
          {COLUMNS.map(col=>{
            const colStories=stories.filter(s=>s.status===col.key)
            return(
              <div key={col.key} style={{flex:'0 0 240px',display:'flex',flexDirection:'column'}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'12px',padding:'0 4px'}}>
                  <div style={{width:'6px',height:'6px',borderRadius:'50%',background:col.color}}/>
                  <span style={{color:col.color,fontSize:'10px',letterSpacing:'1.5px'}}>{col.label}</span>
                  <span style={{marginLeft:'auto',background:'rgba(255,255,255,0.07)',color:'#666',fontSize:'10px',borderRadius:'10px',padding:'1px 8px'}}>{colStories.length}</span>
                </div>
                <div style={{minHeight:'200px',background:'rgba(255,255,255,0.02)',borderRadius:'6px',padding:'8px',border:'1px solid rgba(255,255,255,0.05)',display:'flex',flexDirection:'column',gap:'8px'}}>
                  {colStories.map(story=>(
                    <div key={story.id} style={{padding:'12px',borderRadius:'5px',background:'#0d0d14',border:'1px solid rgba(255,255,255,0.07)',cursor:story.status==='unassigned'?'pointer':'default'}} onClick={()=>story.status==='unassigned'&&setAssignStory(story)}>
                      <div style={{display:'flex',justifyContent:'space-between',marginBottom:'6px'}}>
                        <span style={{padding:'2px 5px',borderRadius:'3px',fontSize:'9px',background:urgencyColor[story.urgency]+'20',color:urgencyColor[story.urgency]}}>{story.urgency.toUpperCase()}</span>
                        <span style={{color:'#555',fontSize:'10px',background:'rgba(255,255,255,0.05)',padding:'1px 5px',borderRadius:'3px'}}>P{story.priority}</span>
                      </div>
                      <p style={{color:'#ddd',fontSize:'12px',margin:'0 0 8px',lineHeight:1.4}}>{story.headline}</p>
                      <div style={{display:'flex',justifyContent:'space-between'}}>
                        <span style={{color:'#444',fontSize:'10px'}}>{story.category}</span>
                        <span style={{color:'#555',fontSize:'10px'}}>{story.deadline}</span>
                      </div>
                      {assignMap[story.id]&&<div style={{marginTop:'8px',padding:'4px 8px',background:'rgba(255,180,0,0.06)',borderRadius:'3px',color:'#ffb400',fontSize:'10px'}}>{assignMap[story.id]}</div>}
                      {story.status==='unassigned'&&<div style={{marginTop:'8px',color:'#ffb400',fontSize:'10px'}}>Click to assign →</div>}
                    </div>
                  ))}
                  {colStories.length===0&&!loading&&<div style={{color:'#333',fontSize:'11px',textAlign:'center',padding:'20px 0'}}>Empty</div>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      {assignStory&&<AssignModal story={assignStory} onClose={()=>setAssignStory(null)} onAssigned={load}/>}
    </div>
  )
}
`)

fs.writeFileSync('src/pages/ReporterQueue.tsx', `import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
const STATUS_FLOW: Record<string,string> = { assigned:'in_progress', in_progress:'filed' }
const STATUS_LABEL: Record<string,string> = { assigned:'START WORKING', in_progress:'MARK AS FILED' }
const urgencyColor: Record<string,string> = { breaking:'#ff4444', high:'#ff8800', normal:'#ffb400', low:'#64c896' }
const statusColor: Record<string,string> = { assigned:'#ffb400', in_progress:'#64c896', filed:'#8888ff' }
export default function ReporterQueue() {
  const { reporterId } = useAuth()
  const [stories, setStories] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [updating, setUpdating] = useState<string|null>(null)
  async function load() {
    if (!reporterId) return
    const { data } = await supabase.from('assignments').select('*, stories(*)').eq('reporter_id',reporterId).eq('is_active',true).order('assigned_at',{ascending:false})
    setStories((data||[]).map((a:any)=>({...a.stories,assignment_id:a.id}))); setLoading(false)
  }
  useEffect(()=>{load()},[reporterId])
  async function advanceStatus(story: any) {
    const next=STATUS_FLOW[story.status]; if(!next) return
    setUpdating(story.id)
    await supabase.from('stories').update({status:next}).eq('id',story.id)
    await load(); setUpdating(null)
  }
  const active=stories.filter(s=>s.status!=='filed'&&s.status!=='published')
  const filed=stories.filter(s=>s.status==='filed'||s.status==='published')
  return (
    <div style={{minHeight:'100vh',background:'#0a0a0f',fontFamily:'"DM Mono","Courier New",monospace'}}>
      <Navbar/>
      <div style={{padding:'32px 24px',maxWidth:'800px',margin:'0 auto'}}>
        <div style={{marginBottom:'32px'}}><h1 style={{color:'#fff',margin:'0 0 4px',fontSize:'18px'}}>My Stories</h1><p style={{color:'#555',margin:0,fontSize:'12px'}}>Your active assignments</p></div>
        {loading?<div style={{color:'#555',textAlign:'center',padding:'60px'}}>Loading...</div>:(
          <>
            <div style={{marginBottom:'32px'}}>
              <h2 style={{color:'#888',fontSize:'11px',letterSpacing:'1.5px',margin:'0 0 12px'}}>ACTIVE — {active.length}</h2>
              {active.length===0?<div style={{color:'#333',fontSize:'13px',textAlign:'center',padding:'40px',border:'1px dashed rgba(255,255,255,0.07)',borderRadius:'6px'}}>No active stories assigned to you</div>:(
                <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                  {active.map(story=>(
                    <div key={story.id} style={{padding:'20px',borderRadius:'6px',border:'1px solid rgba(255,255,255,0.07)',background:'rgba(255,255,255,0.02)'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'8px',flexWrap:'wrap'}}>
                            <span style={{padding:'2px 8px',borderRadius:'3px',fontSize:'9px',background:urgencyColor[story.urgency]+'20',color:urgencyColor[story.urgency]}}>{story.urgency?.toUpperCase()}</span>
                            <span style={{padding:'2px 8px',borderRadius:'3px',fontSize:'9px',background:statusColor[story.status]+'15',color:statusColor[story.status]}}>{story.status?.replace('_',' ').toUpperCase()}</span>
                          </div>
                          <h3 style={{color:'#fff',margin:'0 0 8px',fontSize:'15px',fontWeight:'600'}}>{story.headline}</h3>
                          <div style={{display:'flex',gap:'16px'}}><span style={{color:'#555',fontSize:'11px'}}>Deadline: <span style={{color:'#888'}}>{story.deadline}</span></span></div>
                        </div>
                        {STATUS_FLOW[story.status]&&<button onClick={()=>advanceStatus(story)} disabled={updating===story.id} style={{padding:'10px 18px',marginLeft:'16px',background:story.status==='assigned'?'rgba(255,180,0,0.1)':'rgba(100,200,150,0.1)',border:'1px solid '+(story.status==='assigned'?'rgba(255,180,0,0.3)':'rgba(100,200,150,0.3)'),borderRadius:'4px',color:story.status==='assigned'?'#ffb400':'#64c896',fontSize:'10px',cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',opacity:updating===story.id?0.6:1}}>{updating===story.id?'...':STATUS_LABEL[story.status]}</button>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {filed.length>0&&<div><h2 style={{color:'#555',fontSize:'11px',letterSpacing:'1.5px',margin:'0 0 12px'}}>FILED — {filed.length}</h2><div style={{display:'flex',flexDirection:'column',gap:'8px'}}>{filed.map(s=><div key={s.id} style={{padding:'14px 20px',borderRadius:'6px',border:'1px solid rgba(255,255,255,0.04)',background:'rgba(255,255,255,0.01)',display:'flex',justifyContent:'space-between'}}><span style={{color:'#555',fontSize:'13px'}}>{s.headline}</span><span style={{color:'#444',fontSize:'10px'}}>{s.status?.toUpperCase()}</span></div>)}</div></div>}
          </>
        )}
      </div>
    </div>
  )
}
`)

fs.writeFileSync('src/pages/ReporterRoster.tsx', `import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import Navbar from '../components/Navbar'
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
function getWeekStart() { const d=new Date(); const day=d.getDay(); const diff=d.getDate()-day+(day===0?-6:1); d.setDate(diff); return d.toISOString().split('T')[0] }
export default function ReporterRoster() {
  const [reporters, setReporters] = useState<any[]>([])
  const [availability, setAvailability] = useState<any[]>([])
  const [assignments, setAssignments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const weekStart = getWeekStart()
  async function load() {
    const [{ data:r },{ data:a },{ data:ass }] = await Promise.all([
      supabase.from('reporters').select('*').eq('status','active').order('name'),
      supabase.from('availability').select('*').eq('week_start_date',weekStart),
      supabase.from('assignments').select('reporter_id').eq('is_active',true)
    ])
    setReporters(r||[]); setAvailability(a||[]); setAssignments(ass||[]); setLoading(false)
  }
  useEffect(()=>{load()},[])
  const availMap: Record<string,string[]> = {}
  availability.forEach(a=>{ availMap[a.reporter_id]=a.available_days })
  const countMap: Record<string,number> = {}
  assignments.forEach(a=>{ countMap[a.reporter_id]=(countMap[a.reporter_id]||0)+1 })
  return (
    <div style={{minHeight:'100vh',background:'#0a0a0f',fontFamily:'"DM Mono","Courier New",monospace'}}>
      <Navbar/>
      <div style={{padding:'32px 24px',maxWidth:'1200px',margin:'0 auto'}}>
        <div style={{marginBottom:'24px'}}><h1 style={{color:'#fff',margin:'0 0 4px',fontSize:'18px'}}>Reporter Roster</h1><p style={{color:'#555',margin:0,fontSize:'12px'}}>Week of {weekStart}</p></div>
        {loading?<div style={{color:'#555',textAlign:'center',padding:'60px'}}>Loading...</div>:(
          <div style={{overflowX:'auto'}}>
            <table style={{width:'100%',borderCollapse:'separate',borderSpacing:'0 6px'}}>
              <thead><tr>
                <th style={{color:'#555',fontSize:'10px',textAlign:'left',padding:'0 12px 8px',fontWeight:400}}>REPORTER</th>
                <th style={{color:'#555',fontSize:'10px',textAlign:'left',padding:'0 12px 8px',fontWeight:400}}>BEATS</th>
                {DAYS.map(d=><th key={d} style={{color:'#555',fontSize:'10px',padding:'0 4px 8px',fontWeight:400,textAlign:'center',minWidth:'36px'}}>{d}</th>)}
                <th style={{color:'#555',fontSize:'10px',padding:'0 12px 8px',fontWeight:400,textAlign:'center'}}>STORIES</th>
              </tr></thead>
              <tbody>
                {reporters.map(r=>{
                  const avail=availMap[r.id]||[]; const active=countMap[r.id]||0
                  return(
                    <tr key={r.id}>
                      <td style={{padding:'12px',background:'rgba(255,255,255,0.02)',borderRadius:'6px 0 0 6px',border:'1px solid rgba(255,255,255,0.06)',borderRight:'none'}}><div style={{color:'#ddd',fontSize:'13px',fontWeight:'600'}}>{r.name}</div><div style={{color:'#555',fontSize:'11px'}}>{r.email}</div></td>
                      <td style={{padding:'12px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderLeft:'none',borderRight:'none'}}><div style={{display:'flex',flexWrap:'wrap',gap:'4px'}}>{r.beats.map((b:string)=><span key={b} style={{padding:'2px 6px',background:'rgba(255,180,0,0.08)',border:'1px solid rgba(255,180,0,0.2)',borderRadius:'3px',color:'#ffb400',fontSize:'9px'}}>{b}</span>)}</div></td>
                      {DAYS.map(day=><td key={day} style={{padding:'4px',background:'rgba(255,255,255,0.02)',border:'1px solid rgba(255,255,255,0.06)',borderLeft:'none',borderRight:'none',textAlign:'center'}}><div style={{width:'24px',height:'24px',borderRadius:'50%',margin:'0 auto',background:avail.includes(day)?'rgba(100,200,150,0.2)':'rgba(255,255,255,0.04)',border:'1px solid '+(avail.includes(day)?'rgba(100,200,150,0.4)':'rgba(255,255,255,0.08)'),display:'flex',alignItems:'center',justifyContent:'center'}}>{avail.includes(day)&&<div style={{width:'6px',height:'6px',borderRadius:'50%',background:'#64c896'}}/>}</div></td>)}
                      <td style={{padding:'12px',background:'rgba(255,255,255,0.02)',borderRadius:'0 6px 6px 0',border:'1px solid rgba(255,255,255,0.06)',borderLeft:'none',textAlign:'center'}}><span style={{color:active>0?'#ffb400':'#555',fontSize:'14px',fontWeight:'600'}}>{active}</span><span style={{color:'#444',fontSize:'11px'}}>/{r.max_stories_per_week}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
`)

fs.writeFileSync('src/pages/AvailabilityPage.tsx', `import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
const DAYS = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
function getWeekStart(offset=0) { const d=new Date(); const day=d.getDay(); const diff=d.getDate()-day+(day===0?-6:1)+offset*7; d.setDate(diff); return d.toISOString().split('T')[0] }
export default function AvailabilityPage() {
  const { reporterId } = useAuth()
  const [selectedDays, setSelectedDays] = useState<string[]>([])
  const [weekOffset, setWeekOffset] = useState(0)
  const [existing, setExisting] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [leaves, setLeaves] = useState<any[]>([])
  const [showLeave, setShowLeave] = useState(false)
  const [leaveForm, setLeaveForm] = useState({leave_date:'',leave_type:'planned',notes:''})
  const [submittingLeave, setSubmittingLeave] = useState(false)
  const weekStart = getWeekStart(weekOffset)
  async function load() {
    if (!reporterId) return
    const { data } = await supabase.from('availability').select('*').eq('reporter_id',reporterId).eq('week_start_date',weekStart).maybeSingle()
    if (data) { setExisting(data); setSelectedDays(data.available_days) } else { setExisting(null); setSelectedDays([]) }
    const { data: leavesData } = await supabase.from('leave_requests').select('*').eq('reporter_id',reporterId).order('created_at',{ascending:false})
    setLeaves(leavesData||[])
  }
  useEffect(()=>{load()},[reporterId,weekStart])
  function toggleDay(day:string) { setSelectedDays(prev=>prev.includes(day)?prev.filter(d=>d!==day):[...prev,day]); setSaved(false) }
  async function saveAvailability() {
    if (!reporterId) return; setSaving(true)
    if (existing) await supabase.from('availability').update({available_days:selectedDays}).eq('id',existing.id)
    else await supabase.from('availability').insert({reporter_id:reporterId,week_start_date:weekStart,available_days:selectedDays})
    setSaving(false); setSaved(true); setTimeout(()=>setSaved(false),2000); load()
  }
  async function submitLeave() {
    if (!reporterId||!leaveForm.leave_date) return; setSubmittingLeave(true)
    await supabase.from('leave_requests').insert({reporter_id:reporterId,leave_date:leaveForm.leave_date,leave_type:leaveForm.leave_type,is_immediate:leaveForm.leave_type==='emergency'||leaveForm.leave_type==='sick',notes:leaveForm.notes,status:'pending'})
    setSubmittingLeave(false); setShowLeave(false); setLeaveForm({leave_date:'',leave_type:'planned',notes:''}); load()
  }
  const ltc: Record<string,string> = {planned:'#ffb400',sick:'#ff8800',emergency:'#ff4444'}
  const lsc: Record<string,string> = {pending:'#ff8800',acknowledged:'#64c896'}
  return (
    <div style={{minHeight:'100vh',background:'#0a0a0f',fontFamily:'"DM Mono","Courier New",monospace'}}>
      <Navbar/>
      <div style={{padding:'32px 24px',maxWidth:'700px',margin:'0 auto'}}>
        <div style={{marginBottom:'40px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'20px',flexWrap:'wrap',gap:'12px'}}>
            <div><h1 style={{color:'#fff',margin:'0 0 4px',fontSize:'18px'}}>Weekly Availability</h1><p style={{color:'#555',margin:0,fontSize:'12px'}}>Week of {weekStart}</p></div>
            <div style={{display:'flex',gap:'8px'}}>
              <button onClick={()=>setWeekOffset(w=>w-1)} style={{padding:'7px 12px',background:'transparent',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'4px',color:'#888',fontSize:'11px',cursor:'pointer',fontFamily:'inherit'}}>← Prev</button>
              <button onClick={()=>setWeekOffset(0)} style={{padding:'7px 12px',background:'transparent',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'4px',color:'#888',fontSize:'11px',cursor:'pointer',fontFamily:'inherit'}}>This Week</button>
              <button onClick={()=>setWeekOffset(w=>w+1)} style={{padding:'7px 12px',background:'transparent',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'4px',color:'#888',fontSize:'11px',cursor:'pointer',fontFamily:'inherit'}}>Next →</button>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'8px',marginBottom:'20px'}}>
            {DAYS.map(day=><button key={day} onClick={()=>toggleDay(day)} style={{padding:'16px 8px',borderRadius:'6px',cursor:'pointer',border:'1px solid '+(selectedDays.includes(day)?'rgba(100,200,150,0.4)':'rgba(255,255,255,0.07)'),background:selectedDays.includes(day)?'rgba(100,200,150,0.08)':'rgba(255,255,255,0.02)',color:selectedDays.includes(day)?'#64c896':'#555',fontSize:'11px',fontFamily:'inherit',textAlign:'center'}}><div style={{fontSize:'10px',marginBottom:'8px',opacity:0.7}}>{day}</div><div style={{width:'10px',height:'10px',borderRadius:'50%',margin:'0 auto',background:selectedDays.includes(day)?'#64c896':'rgba(255,255,255,0.1)'}}/></button>)}
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'12px'}}>
            <button onClick={saveAvailability} disabled={saving} style={{padding:'12px 28px',background:'#ffb400',border:'none',borderRadius:'6px',color:'#0a0a0f',fontSize:'12px',letterSpacing:'1px',fontWeight:'700',cursor:'pointer',fontFamily:'inherit',opacity:saving?0.6:1}}>{saving?'SAVING...':'SAVE AVAILABILITY'}</button>
            {saved&&<span style={{color:'#64c896',fontSize:'12px'}}>✓ Saved!</span>}
          </div>
        </div>
        <div>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'16px'}}>
            <h2 style={{color:'#fff',margin:0,fontSize:'14px',letterSpacing:'1px'}}>LEAVE REQUESTS</h2>
            <button onClick={()=>setShowLeave(true)} style={{padding:'8px 18px',background:'transparent',border:'1px solid rgba(255,255,255,0.15)',borderRadius:'4px',color:'#888',fontSize:'11px',cursor:'pointer',fontFamily:'inherit'}}>+ FILE LEAVE</button>
          </div>
          {leaves.length===0?<div style={{color:'#333',fontSize:'13px',textAlign:'center',padding:'32px',border:'1px dashed rgba(255,255,255,0.07)',borderRadius:'6px'}}>No leave requests filed</div>:(
            <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
              {leaves.map(l=><div key={l.id} style={{padding:'14px 18px',borderRadius:'6px',border:'1px solid rgba(255,255,255,0.06)',background:'rgba(255,255,255,0.02)',display:'flex',justifyContent:'space-between',alignItems:'center'}}><div><div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'4px'}}><span style={{padding:'2px 8px',borderRadius:'3px',fontSize:'9px',background:ltc[l.leave_type]+'15',color:ltc[l.leave_type]}}>{l.leave_type?.toUpperCase()}</span><span style={{color:'#ddd',fontSize:'13px'}}>{l.leave_date}</span></div>{l.notes&&<p style={{color:'#555',fontSize:'12px',margin:0}}>{l.notes}</p>}</div><span style={{padding:'3px 10px',borderRadius:'3px',fontSize:'10px',background:lsc[l.status]+'15',color:lsc[l.status]}}>{l.status?.toUpperCase()}</span></div>)}
            </div>
          )}
        </div>
      </div>
      {showLeave&&(
        <div style={{position:'fixed',inset:0,background:'rgba(0,0,0,0.85)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:1000}} onClick={e=>{if(e.target===e.currentTarget)setShowLeave(false)}}>
          <div style={{background:'#0d0d14',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'8px',width:'100%',maxWidth:'400px',margin:'24px',padding:'24px',fontFamily:'"DM Mono","Courier New",monospace'}}>
            <div style={{display:'flex',justifyContent:'space-between',marginBottom:'20px'}}><h2 style={{color:'#fff',margin:0,fontSize:'16px'}}>File Leave Request</h2><button onClick={()=>setShowLeave(false)} style={{background:'none',border:'none',color:'#555',fontSize:'20px',cursor:'pointer'}}>×</button></div>
            <div style={{display:'flex',flexDirection:'column',gap:'14px'}}>
              <div><label style={{color:'#888',fontSize:'11px',display:'block',marginBottom:'6px'}}>LEAVE DATE</label><input type="date" value={leaveForm.leave_date} onChange={e=>setLeaveForm(p=>({...p,leave_date:e.target.value}))} style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'6px',color:'#fff',fontSize:'13px',outline:'none',boxSizing:'border-box',fontFamily:'inherit',colorScheme:'dark'}}/></div>
              <div><label style={{color:'#888',fontSize:'11px',display:'block',marginBottom:'8px'}}>TYPE</label><div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px'}}>{(['planned','sick','emergency'] as const).map(t=><button key={t} onClick={()=>setLeaveForm(p=>({...p,leave_type:t}))} style={{padding:'9px',borderRadius:'5px',border:'1px solid',borderColor:leaveForm.leave_type===t?ltc[t]:'rgba(255,255,255,0.1)',background:leaveForm.leave_type===t?ltc[t]+'15':'transparent',color:leaveForm.leave_type===t?ltc[t]:'#555',fontSize:'10px',cursor:'pointer',fontFamily:'inherit',textTransform:'uppercase'}}>{t}</button>)}</div></div>
              <div><label style={{color:'#888',fontSize:'11px',display:'block',marginBottom:'6px'}}>NOTES</label><textarea value={leaveForm.notes} onChange={e=>setLeaveForm(p=>({...p,notes:e.target.value}))} rows={3} style={{width:'100%',padding:'10px 12px',background:'rgba(255,255,255,0.04)',border:'1px solid rgba(255,255,255,0.1)',borderRadius:'6px',color:'#fff',fontSize:'13px',outline:'none',boxSizing:'border-box',fontFamily:'inherit',resize:'none'}}/></div>
              <button onClick={submitLeave} disabled={submittingLeave||!leaveForm.leave_date} style={{padding:'13px',background:'#ffb400',border:'none',borderRadius:'6px',color:'#0a0a0f',fontSize:'12px',fontWeight:'700',cursor:'pointer',fontFamily:'inherit',opacity:submittingLeave||!leaveForm.leave_date?0.5:1}}>{submittingLeave?'SUBMITTING...':'SUBMIT LEAVE REQUEST'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
`)

console.log('All files written!')
console.log('Login:', require('fs').statSync('src/pages/Login.tsx').size, 'bytes')
console.log('EditorDashboard:', require('fs').statSync('src/pages/EditorDashboard.tsx').size, 'bytes')
console.log('KanbanBoard:', require('fs').statSync('src/pages/KanbanBoard.tsx').size, 'bytes')
console.log('ReporterQueue:', require('fs').statSync('src/pages/ReporterQueue.tsx').size, 'bytes')
console.log('ReporterRoster:', require('fs').statSync('src/pages/ReporterRoster.tsx').size, 'bytes')
console.log('AvailabilityPage:', require('fs').statSync('src/pages/AvailabilityPage.tsx').size, 'bytes')