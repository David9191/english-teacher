import { useEffect, useRef, useState } from 'react'

const MODEL = 'et-omniroute-model'
const SYSTEM = 'et-omniroute-system'
const MODELS = [
  'gweb/gemini-3.1-pro',
  'auto',
  'github/gpt-4o',
  'github/gpt-4o-mini',
  'kiro/auto',
  'agy/auto',
]
const DEFAULT_SYSTEM =
  '너는 친절한 영어 선생님이야. 한국어로 쉽게 설명하고, 항상 영어 예문과 해석을 함께 보여줘.'

const ls = (k, d) => localStorage.getItem(k) ?? d

export default function Chat() {
  const [model, setModel] = useState(() => ls(MODEL, MODELS[0]))
  const [system, setSystem] = useState(() => ls(SYSTEM, DEFAULT_SYSTEM))
  const [showSettings, setShowSettings] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [showUsage, setShowUsage] = useState(false)
  const [usage, setUsage] = useState(null)
  const [usageErr, setUsageErr] = useState('')
  const abortRef = useRef(null)
  const endRef = useRef(null)

  useEffect(() => {
    // 이전 OpenRouter 설정 및 키 정리
    localStorage.removeItem('et-openrouter-key')
    localStorage.removeItem('et-openrouter-model')
    localStorage.removeItem('et-openrouter-system')
  }, [])

  useEffect(() => {
    localStorage.setItem(MODEL, model)
    localStorage.setItem(SYSTEM, system)
  }, [model, system])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages])

  async function loadUsage() {
    setUsageErr('')
    try {
      const res = await fetch('/api/usage')
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error?.message ?? `조회 실패 (${res.status})`)
      setUsage(j)
    } catch (err) {
      setUsageErr(err.message)
    }
  }

  useEffect(() => {
    if (!showUsage) return
    loadUsage()
    const t = setInterval(loadUsage, 15000)
    return () => clearInterval(t)
  }, [showUsage])

  async function send(e) {
    e?.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setError('')
    setInput('')
    const history = [...messages, { role: 'user', content: text }]
    setMessages([...history, { role: 'assistant', content: '' }])
    setBusy(true)
    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      // 프론트엔드가 아닌 백엔드 프록시(/api/chat)로 요청하여 API 키 노출 방지
      const res = await fetch('/api/chat', {
        method: 'POST',
        signal: ctrl.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: model.trim(),
          stream: true,
          messages: [...(system.trim() ? [{ role: 'system', content: system }] : []), ...history],
        }),
      })

      if (!res.ok) {
        const j = await res.json().catch(() => null)
        throw new Error(j?.error?.message ?? `요청 실패 (${res.status})`)
      }

      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (; ;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const data = line.slice(6).trim()
          if (data === '[DONE]') continue
          try {
            const j = JSON.parse(data)
            if (j.error) throw new Error(j.error.message ?? '모델 오류')
            const delta = j.choices?.[0]?.delta?.content
            if (delta)
              setMessages((m) => {
                const copy = [...m]
                copy[copy.length - 1] = { role: 'assistant', content: copy.at(-1).content + delta }
                return copy
              })
          } catch (err) {
            if (err instanceof SyntaxError) continue
            throw err
          }
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') setError(err.message)
    } finally {
      setBusy(false)
      setMessages((m) => (m.at(-1)?.role === 'assistant' && !m.at(-1).content ? m.slice(0, -1) : m))
    }
  }

  return (
    <section className="chat">
      <div className="chat-head">
        <div>
          <h1>AI 선생님 채팅</h1>
          <p className="muted small">서버 보안 프록시를 통해 OmniRoute AI 게이트웨이와 대화합니다.</p>
        </div>
        <div className="row">
          <button className="btn" id="chat-usage-toggle" onClick={() => setShowUsage((s) => !s)}>
            📊 사용량
          </button>
          <button className="btn" id="chat-settings-toggle" onClick={() => setShowSettings((s) => !s)}>
            ⚙️ 모델 설정
          </button>
          <button className="btn" id="chat-clear" disabled={!messages.length || busy} onClick={() => setMessages([])}>
            새 대화
          </button>
        </div>
      </div>

      {showUsage && (
        <div className="card glass chat-settings" id="usage-panel">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <strong>OmniRoute 사용 현황</strong>
            <button type="button" className="btn" onClick={loadUsage}>새로고침</button>
          </div>
          {usageErr && <p className="err-text">⚠️ {usageErr}</p>}
          {usage && (
            <>
              <p className="small">
                총 {usage.totals.requests}회 · 입력 {usage.totals.promptTokens} / 출력 {usage.totals.completionTokens} 토큰 · ${usage.totals.cost?.toFixed(4)}
              </p>
              <table className="small" style={{ width: '100%', textAlign: 'left' }}>
                <thead>
                  <tr><th>프로바이더</th><th>요청</th><th>토큰(in/out)</th><th>잔여</th></tr>
                </thead>
                <tbody>
                  {Object.entries(usage.byProvider).map(([p, v]) => {
                    const q = usage.quota.find((x) => x.provider === p || (p === 'antigravity' && x.provider === 'agy'))
                    return (
                      <tr key={p}>
                        <td>{p}</td>
                        <td>{v.requests}</td>
                        <td>{v.promptTokens}/{v.completionTokens}</td>
                        <td>{q ? (q.quotaTotal ? `${q.quotaTotal - q.quotaUsed}/${q.quotaTotal} (${q.percentRemaining}%)` : `${q.percentRemaining}%`) : '-'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              <strong className="small">최근 요청</strong>
              <table className="small" style={{ width: '100%', textAlign: 'left' }}>
                <thead>
                  <tr><th>시간</th><th>프로바이더</th><th>모델</th><th>상태</th><th>지연</th></tr>
                </thead>
                <tbody>
                  {usage.recent.map((l, i) => (
                    <tr key={i}>
                      <td>{new Date(l.timestamp).toLocaleTimeString('ko-KR')}</td>
                      <td>{l.provider}</td>
                      <td>{l.model}</td>
                      <td>{l.status}</td>
                      <td>{l.duration ? `${(l.duration / 1000).toFixed(1)}s` : '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}

      {showSettings && (
        <div className="card glass chat-settings">
          <label>
            모델 (OmniRoute)
            <input id="omni-model" list="omni-models" value={model} onChange={(e) => setModel(e.target.value)} />
            <datalist id="omni-models">
              {MODELS.map((m) => <option key={m} value={m} />)}
            </datalist>
          </label>
          <label>
            시스템 프롬프트
            <textarea id="omni-system" rows={3} value={system} onChange={(e) => setSystem(e.target.value)} />
          </label>
        </div>
      )}

      <div className="chat-log glass" aria-live="polite">
        {!messages.length && (
          <p className="muted center chat-empty">
            예) “현재완료와 과거시제 차이를 예문으로 알려줘”
          </p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content || <span className="typing">…</span>}
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error && <p className="err-text">⚠️ {error}</p>}

      <form className="chat-input" onSubmit={send}>
        <textarea
          id="chat-input"
          rows={2}
          placeholder="메시지를 입력하세요 (Enter 전송, Shift+Enter 줄바꿈)"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) send(e)
          }}
        />
        {busy ? (
          <button type="button" className="btn" id="chat-stop" onClick={() => abortRef.current?.abort()}>
            중지
          </button>
        ) : (
          <button className="btn primary" id="chat-send" disabled={!input.trim()}>
            보내기
          </button>
        )}
      </form>
    </section>
  )
}
