import { useEffect, useState, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Navbar from '../components/Navbar'
import { useTheme } from '../context/ThemeContext'
import { useResponsive } from '../hooks/useResponsive'

const EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏', '🔥', '🎉']
const INPUT_EMOJIS = ['😀', '😂', '😍', '👍', '👎', '🙏', '🔥', '🎉', '❤️', '😮', '😢', '😡', '✅', '⚡', '📌', '🗞️', '📰', '⏰', '🚨', '💯']
const ONLINE_THRESHOLD_MS = 2 * 60 * 1000

function timeAgo(dateStr: string | null) {
  if (!dateStr) return 'never'
  const diff = Date.now() - new Date(dateStr).getTime()
  if (diff < 60000) return 'just now'
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`
  return `${Math.floor(diff / 86400000)}d ago`
}

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatDateDivider(dateStr: string) {
  const d = new Date(dateStr)
  const today = new Date()
  const yesterday = new Date(); yesterday.setDate(today.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return 'Today'
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

export default function ChatPage() {
  const { t } = useTheme()
  const { isMobile, isTablet } = useResponsive()
  const { reporterId, userName, role } = useAuth()
  console.log('[ChatPage debug] reporterId:', reporterId, 'role:', role, 'userName:', userName)

  const [channels, setChannels] = useState<any[]>([])
  const [membersByChannel, setMembersByChannel] = useState<Record<string, any[]>>({})
  const [lastMessages, setLastMessages] = useState<Record<string, any>>({})
  const [allPeople, setAllPeople] = useState<any[]>([])
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null)
  const [messages, setMessages] = useState<any[]>([])
  const [reactions, setReactions] = useState<Record<string, any[]>>({})
  const [input, setInput] = useState('')
  const [replyingTo, setReplyingTo] = useState<any>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const [typingUsers, setTypingUsers] = useState<any[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupMembers, setNewGroupMembers] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [emojiPickerFor, setEmojiPickerFor] = useState<string | null>(null)
  const [activeMenuFor, setActiveMenuFor] = useState<string | null>(null)
  const [showMobileChat, setShowMobileChat] = useState(false)
  const [showInputEmoji, setShowInputEmoji] = useState(false)
  // ── Mention states ──
  const [mentionSearch, setMentionSearch] = useState('')
  const [showMentions, setShowMentions] = useState(false)
  const [mentionIndex, setMentionIndex] = useState(0)

  const messagesEndRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const typingTimeoutRef = useRef<any>(null)

  // ── Load channels + members + last messages ──
  async function loadChannels() {
    if (!reporterId) return
    const { data: myMemberships } = await supabase
      .from('chat_channel_members')
      .select('channel_id')
      .eq('reporter_id', reporterId)

    const channelIds = (myMemberships || []).map(m => m.channel_id)
    if (channelIds.length === 0) { setChannels([]); setLoading(false); return }

    const { data: channelData } = await supabase
      .from('chat_channels')
      .select('*')
      .in('id', channelIds)

    const { data: allMembers } = await supabase
      .from('chat_channel_members')
      .select('*, reporters(id, name, email, last_seen_at)')
      .in('channel_id', channelIds)

    const memberMap: Record<string, any[]> = {}
    ;(allMembers || []).forEach((m: any) => {
      if (!memberMap[m.channel_id]) memberMap[m.channel_id] = []
      memberMap[m.channel_id].push(m)
    })
    setMembersByChannel(memberMap)

    const { data: recentMsgs } = await supabase
      .from('chat_messages')
      .select('channel_id, content, created_at, sender_id, is_deleted')
      .in('channel_id', channelIds)
      .order('created_at', { ascending: false })

    const lastMap: Record<string, any> = {}
    ;(recentMsgs || []).forEach((m: any) => {
      if (!lastMap[m.channel_id]) lastMap[m.channel_id] = m
    })
    setLastMessages(lastMap)

    setChannels(channelData || [])
    setLoading(false)
  }

  async function loadAllPeople() {
    const { data } = await supabase
      .from('reporters')
      .select('id, name, email, status, last_seen_at')
      .order('name')
    setAllPeople((data || []).filter((p: any) => p.id !== reporterId))
  }

  useEffect(() => {
    if (reporterId) {
      loadChannels()
      loadAllPeople()
      markOnline()
      const interval = setInterval(() => { markOnline(); loadAllPeople() }, 30000)
      return () => clearInterval(interval)
    }
  }, [reporterId])

  async function markOnline() {
    if (!reporterId) return
    await supabase.from('reporters').update({ last_seen_at: new Date().toISOString() }).eq('id', reporterId)
  }

  // ── Load messages ──
  async function loadMessages(channelId: string) {
    const { data: msgs } = await supabase
      .from('chat_messages')
      .select('*, reporters!chat_messages_sender_id_fkey(name), chat_attachments(*)')
      .eq('channel_id', channelId)
      .order('created_at', { ascending: true })

    setMessages(msgs || [])

    const msgIds = (msgs || []).map((m: any) => m.id)
    if (msgIds.length > 0) {
      const { data: reacts } = await supabase
        .from('chat_reactions')
        .select('*')
        .in('message_id', msgIds)
      const rMap: Record<string, any[]> = {}
      ;(reacts || []).forEach((r: any) => {
        if (!rMap[r.message_id]) rMap[r.message_id] = []
        rMap[r.message_id].push(r)
      })
      setReactions(rMap)
    } else {
      setReactions({})
    }

    await supabase.from('chat_channel_members')
      .update({ last_read_at: new Date().toISOString() })
      .eq('channel_id', channelId)
      .eq('reporter_id', reporterId)
  }

  useEffect(() => {
    if (activeChannelId) {
      loadMessages(activeChannelId)
      setReplyingTo(null)
      setEditingId(null)
      setShowInputEmoji(false)
      setShowMentions(false)
      setInput('')
    }
  }, [activeChannelId])

  // ── Realtime subscriptions ──
  useEffect(() => {
    if (!activeChannelId) return

    const msgChannel = supabase
      .channel(`chat_messages_${activeChannelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_messages', filter: `channel_id=eq.${activeChannelId}` },
        () => { loadMessages(activeChannelId); loadChannels() })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_reactions' },
        () => { loadMessages(activeChannelId) })
      .subscribe()

    const typingChannel = supabase
      .channel(`chat_typing_${activeChannelId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_typing', filter: `channel_id=eq.${activeChannelId}` },
        async () => {
          const { data } = await supabase
            .from('chat_typing')
            .select('*, reporters(name)')
            .eq('channel_id', activeChannelId)
            .neq('reporter_id', reporterId)
          const recent = (data || []).filter((t: any) => Date.now() - new Date(t.updated_at).getTime() < 4000)
          setTypingUsers(recent)
        })
      .subscribe()

    return () => {
      supabase.removeChannel(msgChannel)
      supabase.removeChannel(typingChannel)
    }
  }, [activeChannelId, reporterId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Typing indicator + mention detection ──
  async function handleTyping(value: string) {
    setInput(value)
    if (!activeChannelId || !reporterId) return

    // Mention detection — only in group channels
    if (activeChannel?.type === 'group') {
      const lastAt = value.lastIndexOf('@')
      if (lastAt !== -1) {
        const afterAt = value.slice(lastAt + 1)
        if (!afterAt.includes(' ')) {
          setMentionSearch(afterAt.toLowerCase())
          setShowMentions(true)
          setMentionIndex(0)
        } else {
          setShowMentions(false)
        }
      } else {
        setShowMentions(false)
      }
    }

    await supabase.from('chat_typing').upsert({
      channel_id: activeChannelId, reporter_id: reporterId, updated_at: new Date().toISOString()
    }, { onConflict: 'channel_id,reporter_id' })
  }

  // ── Insert mention into input ──
  function insertMention(name: string) {
    const lastAt = input.lastIndexOf('@')
    setInput(input.slice(0, lastAt) + `@${name} `)
    setShowMentions(false)
    setMentionSearch('')
  }

  // ── Send message ──
  async function sendMessage() {
    if (!input.trim() || !activeChannelId || !reporterId) return
    setShowMentions(false)
    await supabase.from('chat_messages').insert({
      channel_id: activeChannelId,
      sender_id: reporterId,
      content: input.trim(),
      reply_to_id: replyingTo?.id || null,
    })
    setInput('')
    setReplyingTo(null)
    setShowInputEmoji(false)
    await supabase.from('chat_typing').delete().eq('channel_id', activeChannelId).eq('reporter_id', reporterId)
  }

  // ── Edit message ──
  async function saveEdit() {
    if (!editingId || !editText.trim()) return
    await supabase.from('chat_messages').update({
      content: editText.trim(), updated_at: new Date().toISOString()
    }).eq('id', editingId)
    setEditingId(null)
    setEditText('')
    if (activeChannelId) loadMessages(activeChannelId)
  }

  // ── Delete message ──
  async function deleteMessage(id: string) {
    await supabase.from('chat_messages').update({ is_deleted: true, content: '' }).eq('id', id)
    if (activeChannelId) loadMessages(activeChannelId)
    setActiveMenuFor(null)
  }

  // ── Pin / Unpin ──
  async function togglePin(msg: any) {
    await supabase.from('chat_messages').update({
      is_pinned: !msg.is_pinned,
      pinned_by: !msg.is_pinned ? reporterId : null,
      pinned_at: !msg.is_pinned ? new Date().toISOString() : null,
    }).eq('id', msg.id)
    if (activeChannelId) loadMessages(activeChannelId)
    setActiveMenuFor(null)
  }

  // ── Reactions ──
  async function toggleReaction(messageId: string, emoji: string) {
    const existing = (reactions[messageId] || []).find((r: any) => r.reporter_id === reporterId && r.emoji === emoji)
    if (existing) {
      await supabase.from('chat_reactions').delete().eq('id', existing.id)
    } else {
      await supabase.from('chat_reactions').insert({ message_id: messageId, reporter_id: reporterId, emoji })
    }
    setEmojiPickerFor(null)
    if (activeChannelId) loadMessages(activeChannelId)
  }

  // ── File upload ──
  async function handleFileUpload(e: any) {
    const file = e.target.files?.[0]
    if (!file || !activeChannelId || !reporterId) return
    setUploading(true)
    try {
      const safeName = `${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const path = `${activeChannelId}/${safeName}`
      const { error: upErr } = await supabase.storage.from('chat-files').upload(path, file)
      if (upErr) throw upErr
      const { data: urlData } = supabase.storage.from('chat-files').getPublicUrl(path)
      const { data: msgData, error: msgErr } = await supabase.from('chat_messages').insert({
        channel_id: activeChannelId, sender_id: reporterId, content: input.trim() || '',
      }).select().single()
      if (msgErr) throw msgErr
      await supabase.from('chat_attachments').insert({
        message_id: msgData.id, file_url: urlData.publicUrl,
        file_name: file.name, file_type: file.type, file_size: file.size,
      })
      setInput('')
      loadMessages(activeChannelId)
    } catch (err: any) {
      alert('Upload failed: ' + err.message)
    }
    setUploading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  // ── New DM ──
  async function startDM(otherId: string) {
    console.log('[startDM] called with otherId:', otherId, 'reporterId:', reporterId)
    for (const ch of channels) {
      if (ch.type === 'dm') {
        const members = membersByChannel[ch.id] || []
        const ids = members.map((m: any) => m.reporter_id)
        if (ids.includes(otherId) && ids.includes(reporterId)) {
          console.log('[startDM] existing DM found, opening:', ch.id)
          setActiveChannelId(ch.id); setShowMobileChat(true); return
        }
      }
    }
    console.log('[startDM] no existing DM, creating new channel')
    const { data: newChannel, error: channelErr } = await supabase.from('chat_channels').insert({
      type: 'dm', created_by: reporterId
    }).select().single()
    if (channelErr) console.error('[startDM] channel insert failed:', channelErr)
    if (!newChannel) { console.warn('[startDM] no newChannel returned, aborting'); return }
    console.log('[startDM] channel created:', newChannel.id)
    const { error: memberErr } = await supabase.from('chat_channel_members').insert([
      { channel_id: newChannel.id, reporter_id: reporterId },
      { channel_id: newChannel.id, reporter_id: otherId },
    ])
    if (memberErr) console.error('[startDM] member insert failed:', memberErr)
    await loadChannels()
    setActiveChannelId(newChannel.id)
    setShowMobileChat(true)
    console.log('[startDM] done, activeChannelId set to:', newChannel.id)
  }

  // ── New Group ──
  async function createGroup() {
    if (!newGroupName.trim() || !reporterId) return
    const { data: newChannel } = await supabase.from('chat_channels').insert({
      type: 'group', name: newGroupName.trim(), created_by: reporterId
    }).select().single()
    if (!newChannel) return
    const memberInserts = [
      { channel_id: newChannel.id, reporter_id: reporterId, is_admin: true },
      ...newGroupMembers.map(id => ({ channel_id: newChannel.id, reporter_id: id, is_admin: false }))
    ]
    await supabase.from('chat_channel_members').insert(memberInserts)
    setShowNewGroup(false); setNewGroupName(''); setNewGroupMembers([])
    await loadChannels()
    setActiveChannelId(newChannel.id)
    setShowMobileChat(true)
  }

  // ── Helpers ──
  function getOtherMember(channel: any) {
    const members = membersByChannel[channel.id] || []
    return members.find((m: any) => m.reporter_id !== reporterId)?.reporters
  }

  function getChannelName(channel: any) {
    if (channel.type === 'dm') return getOtherMember(channel)?.name || 'Unknown'
    return channel.name
  }

  function isOnline(lastSeenAt: string | null) {
    if (!lastSeenAt) return false
    return Date.now() - new Date(lastSeenAt).getTime() < ONLINE_THRESHOLD_MS
  }

  function hasUnread(channel: any) {
    const last = lastMessages[channel.id]
    if (!last) return false
    const myMembership = (membersByChannel[channel.id] || []).find((m: any) => m.reporter_id === reporterId)
    if (!myMembership) return false
    return new Date(last.created_at) > new Date(myMembership.last_read_at) && last.sender_id !== reporterId
  }

  const activeChannel = channels.find(c => c.id === activeChannelId)
  const activeMembers = activeChannelId ? (membersByChannel[activeChannelId] || []) : []
  const onlineCount = activeMembers.filter((m: any) => isOnline(m.reporters?.last_seen_at)).length
  const pinnedMessages = messages.filter(m => m.is_pinned)
  const filteredMessages = searchTerm
    ? messages.filter(m => m.content?.toLowerCase().includes(searchTerm.toLowerCase()))
    : messages
  const dmChannels = channels.filter(c => c.type === 'dm')
  const groupChannels = channels.filter(c => c.type === 'group')

  // ── Mention pool: group members only, filtered by search ──
  const mentionPool = (activeChannel?.type === 'group' && showMentions)
    ? activeMembers
        .filter((m: any) => m.reporter_id !== reporterId)
        .map((m: any) => m.reporters)
        .filter(Boolean)
        .filter((p: any) => p.name?.toLowerCase().includes(mentionSearch))
    : []

  const sidebarWidth = isTablet ? '240px' : '300px'

  return (
    <div style={{ minHeight: '100vh', background: t.bgPage, fontFamily: '"Inter", "DM Mono", "Courier New", monospace', color: t.textPrimary }}>
      <Navbar />
      <div style={{
        display: 'flex', height: 'calc(100vh - 64px)', maxWidth: '1400px', margin: '0 auto',
        border: `1px solid ${t.borderCard}`, borderRadius: isMobile ? '0' : '10px',
        overflow: 'hidden', boxShadow: t.shadowCard,
        marginTop: isMobile ? '0' : '12px', marginBottom: isMobile ? '0' : '12px',
      }}>

        {/* ── SIDEBAR ── */}
        {(!isMobile || !showMobileChat) && (
          <div style={{ width: isMobile ? '100%' : sidebarWidth, flexShrink: 0, borderRight: isMobile ? 'none' : `1px solid ${t.borderCard}`, background: t.bgCard, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px', borderBottom: `1px solid ${t.borderCard}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <h1 style={{ margin: 0, fontSize: '18px', fontWeight: '700', color: t.textPrimary }}>Messages</h1>
                <button onClick={() => setShowNewGroup(true)}
                  style={{ padding: '6px 12px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, borderRadius: '6px', color: t.accent, fontSize: '11px', fontWeight: '700', cursor: 'pointer', fontFamily: 'inherit', minHeight: '32px' }}>
                  + GROUP
                </button>
              </div>
              <p style={{ margin: 0, fontSize: '12px', color: t.textMuted }}>Signed in as {userName}</p>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
              {groupChannels.length > 0 && (
                <>
                  <div style={{ padding: '8px 8px 4px', fontSize: '11px', fontWeight: '700', color: t.textMuted, letterSpacing: '0.5px' }}>CHANNELS</div>
                  {groupChannels.map(ch => {
                    const last = lastMessages[ch.id]
                    const unread = hasUnread(ch)
                    return (
                      <div key={ch.id} onClick={() => { setActiveChannelId(ch.id); setShowMobileChat(true) }}
                        style={{ padding: '10px', borderRadius: '8px', cursor: 'pointer', marginBottom: '2px', background: activeChannelId === ch.id ? t.accentBg : 'transparent', border: activeChannelId === ch.id ? `1px solid ${t.accentBorder}` : '1px solid transparent' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                            <div style={{ width: '32px', height: '32px', borderRadius: '8px', background: t.accentBg, border: `1px solid ${t.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: t.accent, flexShrink: 0 }}>#</div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: '13px', fontWeight: unread ? '700' : '600', color: t.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ch.name}</div>
                              {last && <div style={{ fontSize: '11px', color: t.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{last.is_deleted ? 'Message deleted' : last.content}</div>}
                            </div>
                          </div>
                          {unread && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.accent, flexShrink: 0 }} />}
                        </div>
                      </div>
                    )
                  })}
                </>
              )}

              <div style={{ padding: '12px 8px 4px', fontSize: '11px', fontWeight: '700', color: t.textMuted, letterSpacing: '0.5px' }}>DIRECT MESSAGES</div>
              {dmChannels.map(ch => {
                const other = getOtherMember(ch)
                const online = isOnline(other?.last_seen_at)
                const last = lastMessages[ch.id]
                const unread = hasUnread(ch)
                return (
                  <div key={ch.id} onClick={() => { setActiveChannelId(ch.id); setShowMobileChat(true) }}
                    style={{ padding: '10px', borderRadius: '8px', cursor: 'pointer', marginBottom: '2px', background: activeChannelId === ch.id ? t.accentBg : 'transparent', border: activeChannelId === ch.id ? `1px solid ${t.accentBorder}` : '1px solid transparent' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: t.bgInput, border: `1px solid ${t.borderCard}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: '700', color: t.textSecondary }}>{other?.name?.charAt(0) || '?'}</div>
                          <div style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '10px', height: '10px', borderRadius: '50%', background: online ? t.success : t.textDisabled, border: `2px solid ${t.bgCard}` }} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: unread ? '700' : '600', color: t.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{other?.name || 'Unknown'}</div>
                          {last && <div style={{ fontSize: '11px', color: t.textMuted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{last.is_deleted ? 'Message deleted' : last.content}</div>}
                        </div>
                      </div>
                      {unread && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: t.accent, flexShrink: 0 }} />}
                    </div>
                  </div>
                )
              })}

              <div style={{ padding: '12px 8px 4px', fontSize: '11px', fontWeight: '700', color: t.textMuted, letterSpacing: '0.5px' }}>PEOPLE</div>
              {allPeople.filter(p => !dmChannels.some(ch => getOtherMember(ch)?.id === p.id)).map(p => {
                const online = isOnline(p.last_seen_at)
                return (
                  <div key={p.id} onClick={() => startDM(p.id)}
                    style={{ padding: '10px', borderRadius: '8px', cursor: 'pointer', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: t.bgInput, border: `1px solid ${t.borderCard}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: '700', color: t.textSecondary }}>{p.name?.charAt(0)}</div>
                      <div style={{ position: 'absolute', bottom: '-1px', right: '-1px', width: '9px', height: '9px', borderRadius: '50%', background: online ? t.success : t.textDisabled, border: `2px solid ${t.bgCard}` }} />
                    </div>
                    <div style={{ fontSize: '13px', color: t.textSecondary, fontWeight: '500' }}>{p.name}</div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ── CHAT WINDOW ── */}
        {(!isMobile || showMobileChat) && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: t.bgPage }}>
            {!activeChannel ? (
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: t.textDisabled, fontSize: '14px' }}>
                Select a conversation to start chatting
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${t.borderCard}`, background: t.bgCard, display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {isMobile && (
                    <button onClick={() => setShowMobileChat(false)}
                      style={{ background: 'none', border: 'none', color: t.textSecondary, fontSize: '20px', cursor: 'pointer', padding: '4px', minWidth: '36px', minHeight: '36px' }}>‹</button>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: '700', color: t.textPrimary }}>
                      {activeChannel.type === 'group' ? `# ${activeChannel.name}` : getChannelName(activeChannel)}
                    </div>
                    <div style={{ fontSize: '11px', color: t.textMuted }}>
                      {activeChannel.type === 'group'
                        ? `${activeMembers.length} members · ${onlineCount} online`
                        : isOnline(getOtherMember(activeChannel)?.last_seen_at) ? 'Online' : `Last seen ${timeAgo(getOtherMember(activeChannel)?.last_seen_at)}`}
                    </div>
                  </div>
                  <button onClick={() => setSearchOpen(!searchOpen)}
                    style={{ background: searchOpen ? t.accentBg : 'none', border: `1px solid ${searchOpen ? t.accentBorder : 'transparent'}`, borderRadius: '6px', color: searchOpen ? t.accent : t.textMuted, fontSize: '16px', cursor: 'pointer', padding: '6px 10px', minHeight: '36px' }}>
                    🔍
                  </button>
                </div>

                {/* Search bar */}
                {searchOpen && (
                  <div style={{ padding: '8px 16px', borderBottom: `1px solid ${t.borderCard}`, background: t.bgCard }}>
                    <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Search messages..." autoFocus
                      style={{ width: '100%', padding: '8px 12px', background: t.bgInput, border: `1px solid ${t.borderInput}`, borderRadius: '6px', color: t.textPrimary, fontSize: isMobile ? '16px' : '13px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                  </div>
                )}

                {/* Pinned messages banner */}
                {pinnedMessages.length > 0 && !searchOpen && (
                  <div style={{ padding: '8px 16px', background: t.warningBg, borderBottom: `1px solid ${t.warningBorder}`, fontSize: '12px', color: t.warning, display: 'flex', alignItems: 'center', gap: '6px', overflowX: 'auto', whiteSpace: 'nowrap' }}>
                    📌 <strong>{pinnedMessages.length} pinned</strong> — {pinnedMessages[pinnedMessages.length - 1].content?.slice(0, 60)}
                  </div>
                )}

                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: isMobile ? '12px' : '16px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {filteredMessages.map((msg, idx) => {
                    const isMine = msg.sender_id === reporterId
                    const prevMsg = filteredMessages[idx - 1]
                    const showDateDivider = !prevMsg || new Date(prevMsg.created_at).toDateString() !== new Date(msg.created_at).toDateString()
                    const msgReactions = reactions[msg.id] || []
                    const groupedReactions: Record<string, any[]> = {}
                    msgReactions.forEach((r: any) => {
                      if (!groupedReactions[r.emoji]) groupedReactions[r.emoji] = []
                      groupedReactions[r.emoji].push(r)
                    })
                    const repliedMsg = msg.reply_to_id ? messages.find(m => m.id === msg.reply_to_id) : null
                    const isLastMine = isMine && idx === filteredMessages.length - 1
                    const seenByOthers = isLastMine && activeMembers.some((m: any) =>
                      m.reporter_id !== reporterId && new Date(m.last_read_at) >= new Date(msg.created_at)
                    )

                    // Highlight @mentions in message content
                    function renderContent(content: string) {
                      const parts = content.split(/(@\w[\w\s]*)/g)
                      return parts.map((part, i) =>
                        part.startsWith('@')
                          ? <span key={i} style={{ color: isMine ? t.accentText : t.accent, fontWeight: '700', background: isMine ? 'rgba(255,255,255,0.2)' : t.accentBg, borderRadius: '3px', padding: '0 2px' }}>{part}</span>
                          : part
                      )
                    }

                    return (
                      <div key={msg.id}>
                        {showDateDivider && (
                          <div style={{ textAlign: 'center', margin: '12px 0', fontSize: '11px', color: t.textDisabled, fontWeight: '600' }}>
                            {formatDateDivider(msg.created_at)}
                          </div>
                        )}
                        <div style={{ display: 'flex', justifyContent: isMine ? 'flex-end' : 'flex-start', marginBottom: '2px' }}>
                          <div style={{ maxWidth: isMobile ? '85%' : '65%', position: 'relative' }}
                            onMouseEnter={() => !isMobile && setActiveMenuFor(msg.id)}
                            onMouseLeave={() => !isMobile && setActiveMenuFor(null)}>
                            {!isMine && (
                              <div style={{ fontSize: '11px', color: t.textMuted, fontWeight: '600', marginBottom: '2px', marginLeft: '4px' }}>{msg.reporters?.name}</div>
                            )}
                            <div style={{ background: isMine ? t.accent : t.bgCard, color: isMine ? t.accentText : t.textPrimary, border: isMine ? 'none' : `1px solid ${t.borderCard}`, borderRadius: '12px', padding: '8px 12px', position: 'relative' }}>
                              {msg.is_pinned && <div style={{ fontSize: '10px', marginBottom: '4px', opacity: 0.8 }}>📌 Pinned</div>}
                              {repliedMsg && (
                                <div style={{ borderLeft: `3px solid ${isMine ? t.accentText : t.accent}`, paddingLeft: '8px', marginBottom: '6px', fontSize: '11px', opacity: 0.75, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  <div style={{ fontWeight: '700' }}>{repliedMsg.reporters?.name}</div>
                                  <div>{repliedMsg.is_deleted ? 'Message deleted' : repliedMsg.content}</div>
                                </div>
                              )}
                              {editingId === msg.id ? (
                                <div>
                                  <input value={editText} onChange={e => setEditText(e.target.value)}
                                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null) }}
                                    autoFocus style={{ width: '100%', padding: '4px 8px', borderRadius: '4px', border: `1px solid ${t.borderInput}`, fontSize: isMobile ? '16px' : '13px', fontFamily: 'inherit', boxSizing: 'border-box', background: t.bgInput, color: t.textPrimary }} />
                                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                                    <button onClick={saveEdit} style={{ fontSize: '10px', padding: '2px 8px', background: t.success, border: 'none', borderRadius: '4px', color: '#fff', cursor: 'pointer', fontFamily: 'inherit' }}>SAVE</button>
                                    <button onClick={() => setEditingId(null)} style={{ fontSize: '10px', padding: '2px 8px', background: 'transparent', border: `1px solid ${t.borderCard}`, borderRadius: '4px', color: t.textMuted, cursor: 'pointer', fontFamily: 'inherit' }}>CANCEL</button>
                                  </div>
                                </div>
                              ) : (
                                <div style={{ fontSize: '13px', lineHeight: 1.4, wordBreak: 'break-word', fontStyle: msg.is_deleted ? 'italic' : 'normal', opacity: msg.is_deleted ? 0.6 : 1 }}>
                                  {msg.is_deleted ? 'Message deleted' : renderContent(msg.content || '')}
                                </div>
                              )}
                              {msg.chat_attachments?.map((att: any) => (
                                <div key={att.id} style={{ marginTop: '6px' }}>
                                  {att.file_type?.startsWith('image/') ? (
                                    <img src={att.file_url} alt={att.file_name} style={{ maxWidth: '100%', maxHeight: '200px', borderRadius: '8px', display: 'block' }} />
                                  ) : (
                                    <a href={att.file_url} target="_blank" rel="noopener noreferrer"
                                      style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', background: isMine ? 'rgba(255,255,255,0.15)' : t.bgInput, borderRadius: '6px', color: 'inherit', textDecoration: 'none', fontSize: '11px', fontWeight: '600' }}>
                                      📎 {att.file_name}
                                    </a>
                                  )}
                                </div>
                              ))}
                              <div style={{ fontSize: '10px', opacity: 0.6, marginTop: '4px', textAlign: 'right' }}>
                                {formatTime(msg.created_at)}{msg.updated_at && !msg.is_deleted ? ' · edited' : ''}
                              </div>
                            </div>

                            {/* Reactions */}
                            {Object.keys(groupedReactions).length > 0 && (
                              <div style={{ display: 'flex', gap: '4px', marginTop: '4px', flexWrap: 'wrap', justifyContent: isMine ? 'flex-end' : 'flex-start' }}>
                                {Object.entries(groupedReactions).map(([emoji, list]) => (
                                  <div key={emoji} onClick={() => toggleReaction(msg.id, emoji)}
                                    style={{ fontSize: '12px', padding: '2px 6px', borderRadius: '10px', cursor: 'pointer', background: list.some((r: any) => r.reporter_id === reporterId) ? t.accentBg : t.bgCard, border: `1px solid ${list.some((r: any) => r.reporter_id === reporterId) ? t.accentBorder : t.borderCard}` }}>
                                    {emoji} {list.length}
                                  </div>
                                ))}
                              </div>
                            )}

                            {seenByOthers && <div style={{ fontSize: '10px', color: t.textDisabled, textAlign: 'right', marginTop: '2px' }}>Seen</div>}

                            {/* Message actions */}
                            {!msg.is_deleted && (activeMenuFor === msg.id || isMobile) && (
                              <div style={{ position: 'absolute', top: '-14px', [isMine ? 'right' : 'left']: '0', display: 'flex', gap: '2px', background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '6px', padding: '2px', boxShadow: t.shadowCard, zIndex: 5 } as any}>
                                <button onClick={() => setEmojiPickerFor(emojiPickerFor === msg.id ? null : msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '4px 6px' }}>😊</button>
                                <button onClick={() => setReplyingTo(msg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '4px 6px' }}>↩️</button>
                                <button onClick={() => togglePin(msg)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '4px 6px' }}>📌</button>
                                {isMine && (
                                  <>
                                    <button onClick={() => { setEditingId(msg.id); setEditText(msg.content) }} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '4px 6px' }}>✏️</button>
                                    <button onClick={() => deleteMessage(msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '13px', padding: '4px 6px' }}>🗑️</button>
                                  </>
                                )}
                              </div>
                            )}

                            {/* Emoji picker for reactions */}
                            {emojiPickerFor === msg.id && (
                              <div style={{ position: 'absolute', top: '-50px', [isMine ? 'right' : 'left']: '0', display: 'flex', gap: '4px', background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '8px', padding: '6px', boxShadow: t.shadow, zIndex: 6 } as any}>
                                {EMOJIS.map(e => (
                                  <span key={e} onClick={() => toggleReaction(msg.id, e)} style={{ cursor: 'pointer', fontSize: '16px' }}>{e}</span>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}

                  {/* Typing indicator */}
                  {typingUsers.length > 0 && (
                    <div style={{ fontSize: '11px', color: t.textMuted, fontStyle: 'italic', padding: '4px 8px' }}>
                      {typingUsers.map((u: any) => u.reporters?.name).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Reply preview bar */}
                {replyingTo && (
                  <div style={{ padding: '8px 16px', background: t.accentBg, borderTop: `1px solid ${t.accentBorder}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: '11px', color: t.accent, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      Replying to <strong>{replyingTo.reporters?.name}</strong>: {replyingTo.content?.slice(0, 50)}
                    </div>
                    <button onClick={() => setReplyingTo(null)} style={{ background: 'none', border: 'none', color: t.accent, fontSize: '16px', cursor: 'pointer', minWidth: '32px', minHeight: '32px' }}>×</button>
                  </div>
                )}

                {/* Input bar */}
                <div style={{ padding: isMobile ? '10px 12px' : '12px 16px', borderTop: `1px solid ${t.borderCard}`, background: t.bgCard, display: 'flex', gap: '8px', alignItems: 'flex-end', position: 'relative' }}>
                  <input ref={fileInputRef} type="file" onChange={handleFileUpload} style={{ display: 'none' }} />

                  {/* Emoji picker panel */}
                  {showInputEmoji && (
                    <div style={{ position: 'absolute', bottom: '100%', left: isMobile ? '8px' : '16px', marginBottom: '8px', display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '4px', background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '10px', padding: '10px', boxShadow: t.shadow, zIndex: 10, width: isMobile ? '220px' : '260px' }}>
                      {INPUT_EMOJIS.map(e => (
                        <button key={e} type="button" onClick={() => { setInput(prev => prev + e); setShowInputEmoji(false) }}
                          style={{ background: 'none', border: 'none', fontSize: '20px', cursor: 'pointer', padding: '6px', borderRadius: '6px' }}>
                          {e}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Mention dropdown — group chat only */}
                  {showMentions && mentionPool.length > 0 && (
                    <div style={{ position: 'absolute', bottom: '100%', left: isMobile ? '8px' : '16px', marginBottom: '8px', background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: '10px', boxShadow: t.shadow, zIndex: 11, minWidth: '200px', overflow: 'hidden' }}>
                      <div style={{ padding: '6px 10px', fontSize: '10px', fontWeight: '700', color: t.textMuted, letterSpacing: '0.5px', borderBottom: `1px solid ${t.borderCard}` }}>
                        GROUP MEMBERS
                      </div>
                      {mentionPool.map((p: any, idx: number) => (
                        <div key={p.id} onClick={() => insertMention(p.name)}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: '13px', fontWeight: '500', color: idx === mentionIndex ? t.accent : t.textPrimary, background: idx === mentionIndex ? t.accentBg : 'transparent', display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: t.accentBg, border: `1px solid ${t.accentBorder}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', fontWeight: '700', color: t.accent, flexShrink: 0 }}>
                            {p.name?.charAt(0)}
                          </div>
                          {p.name}
                        </div>
                      ))}
                    </div>
                  )}

                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                    style={{ background: 'none', border: `1px solid ${t.borderCard}`, borderRadius: '8px', fontSize: '16px', cursor: 'pointer', padding: '8px 10px', color: t.textSecondary, minHeight: '40px', flexShrink: 0 }}>
                    {uploading ? '⏳' : '📎'}
                  </button>

                  <button type="button" onClick={() => setShowInputEmoji(!showInputEmoji)}
                    style={{ background: showInputEmoji ? t.accentBg : 'none', border: `1px solid ${showInputEmoji ? t.accentBorder : t.borderCard}`, borderRadius: '8px', fontSize: '16px', cursor: 'pointer', padding: '8px 10px', color: t.textSecondary, minHeight: '40px', flexShrink: 0 }}>
                    😊
                  </button>

                  <textarea
                    value={input}
                    onChange={e => handleTyping(e.target.value)}
                    onKeyDown={e => {
                      if (showMentions && mentionPool.length > 0) {
                        if (e.key === 'ArrowDown') { e.preventDefault(); setMentionIndex(i => Math.min(i + 1, mentionPool.length - 1)); return }
                        if (e.key === 'ArrowUp') { e.preventDefault(); setMentionIndex(i => Math.max(i - 1, 0)); return }
                        if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); insertMention(mentionPool[mentionIndex]?.name); return }
                        if (e.key === 'Escape') { setShowMentions(false); return }
                      }
                      if (e.key === 'Enter' && !e.shiftKey && !showMentions) { e.preventDefault(); sendMessage() }
                    }}
                    placeholder={activeChannel?.type === 'group' ? 'Type a message... (@ to mention)' : 'Type a message...'}
                    rows={1}
                    style={{ flex: 1, padding: '10px 14px', background: t.bgInput, border: `1px solid ${t.borderInput}`, borderRadius: '8px', color: t.textPrimary, fontSize: isMobile ? '16px' : '13px', outline: 'none', fontFamily: 'inherit', resize: 'none', maxHeight: '100px', boxSizing: 'border-box' }}
                  />
                  <button onClick={sendMessage} disabled={!input.trim()}
                    style={{ padding: '10px 16px', background: input.trim() ? t.accent : t.textMuted, border: 'none', borderRadius: '8px', color: t.accentText, fontSize: '13px', fontWeight: '700', cursor: input.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', minHeight: '40px', flexShrink: 0 }}>
                    SEND
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* New Group Modal */}
      {showNewGroup && (
        <div role="dialog" aria-modal="true"
          style={{ position: 'fixed', inset: 0, background: t.overlayBg, display: 'flex', alignItems: isMobile ? 'flex-end' : 'center', justifyContent: 'center', zIndex: 1000 }}
          onClick={e => { if (e.target === e.currentTarget) setShowNewGroup(false) }}>
          <div style={{ background: t.bgCard, border: `1px solid ${t.borderCard}`, borderRadius: isMobile ? '14px 14px 0 0' : '12px', width: '100%', maxWidth: isMobile ? '100%' : '420px', margin: isMobile ? '0' : '24px', padding: isMobile ? '20px 16px' : '28px', fontFamily: 'inherit', boxShadow: t.shadow, maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '16px', alignItems: 'center' }}>
              <h2 style={{ color: t.textPrimary, margin: 0, fontSize: '16px', fontWeight: '700' }}>New Group Channel</h2>
              <button onClick={() => setShowNewGroup(false)} style={{ background: 'none', border: 'none', color: t.textMuted, fontSize: '22px', cursor: 'pointer', minWidth: '44px', minHeight: '44px' }}>×</button>
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '6px' }}>CHANNEL NAME</label>
              <input value={newGroupName} onChange={e => setNewGroupName(e.target.value)} placeholder="e.g. sports-desk"
                style={{ width: '100%', padding: '10px 14px', background: t.bgInput, border: `1px solid ${t.borderInput}`, borderRadius: '8px', color: t.textPrimary, fontSize: isMobile ? '16px' : '13px', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' }} />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label style={{ color: t.textSecondary, fontSize: '12px', fontWeight: '600', display: 'block', marginBottom: '8px' }}>ADD MEMBERS</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '200px', overflowY: 'auto' }}>
                {allPeople.map(p => (
                  <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px', borderRadius: '6px', background: newGroupMembers.includes(p.id) ? t.accentBg : t.bgInput, cursor: 'pointer', fontSize: '13px' }}>
                    <input type="checkbox" checked={newGroupMembers.includes(p.id)}
                      onChange={() => setNewGroupMembers(prev => prev.includes(p.id) ? prev.filter(id => id !== p.id) : [...prev, p.id])} />
                    {p.name}
                  </label>
                ))}
              </div>
            </div>
            <button onClick={createGroup} disabled={!newGroupName.trim()}
              style={{ width: '100%', padding: '12px', background: newGroupName.trim() ? t.accent : t.textMuted, border: 'none', borderRadius: '8px', color: t.accentText, fontSize: '13px', fontWeight: '700', cursor: newGroupName.trim() ? 'pointer' : 'not-allowed', fontFamily: 'inherit', minHeight: '48px' }}>
              CREATE CHANNEL
            </button>
          </div>
        </div>
      )}
    </div>
  )
}