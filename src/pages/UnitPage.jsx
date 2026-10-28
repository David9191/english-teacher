import { useState } from 'react'
import {
  getUnit,
  allUnits,
  useContent,
  useProgress,
  toggleDone,
  recordAnswer,
  resetQuiz,
  saveContent,
  clearContent,
} from '../lib/store'
import { buildExplainPrompt, buildQuizPrompt, parseContentJson } from '../lib/prompt'

const TABS = [
  ['explain', '📖 설명'],
  ['examples', '💬 예문'],
  ['quiz', '✏️ 문제'],
  ['add', '➕ 콘텐츠 추가'],
]

export default function UnitPage({ id, tab }) {
  const unit = getUnit(id)
  const content = useContent(unit?.id)
  const progress = useProgress()
  if (!unit) return <p className="muted center">없는 UNIT이에요. <a href="#/">홈으로</a></p>

  const idx = allUnits.indexOf(unit)
  const prev = allUnits[idx - 1]
  const next = allUnits[idx + 1]
  const done = !!progress.done[unit.id]
  const counts = { examples: content.examples?.length, quiz: content.questions?.length }

  return (
    <article>
      <a href="#/" className="back" id="back-home">← 목차</a>
      <header className="unit-title glass">
        <span className="chip">
          PART {unit.part.id} · CHAPTER {unit.chapter.id} · p.{unit.page}
        </span>
        <h1>
          UNIT {unit.id}. {unit.title}
        </h1>
        <p className="topics">{unit.topics.join(' · ')}</p>
        {content.summary && <p className="summary">💡 {content.summary}</p>}
        <button id="done-toggle" className={`btn ${done ? 'success' : ''}`} onClick={() => toggleDone(unit.id)}>
          {done ? '✔ 학습 완료' : '학습 완료로 표시'}
        </button>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <a
            key={key}
            id={`tab-${key}`}
            role="tab"
            aria-selected={tab === key}
            className={tab === key ? 'active' : ''}
            href={`#/unit/${unit.id}/${key}`}
          >
            {label}
            {counts[key] ? <small>{counts[key]}</small> : null}
          </a>
        ))}
      </nav>

      {tab === 'explain' && <Explain content={content} unit={unit} />}
      {tab === 'examples' && <Examples content={content} unit={unit} />}
      {tab === 'quiz' && <Quiz content={content} unit={unit} results={progress.quiz[unit.id] ?? {}} />}
      {tab === 'add' && <AddContent unit={unit} content={content} />}

      <footer className="pager">
        {prev ? <a className="btn" href={`#/unit/${prev.id}`}>← UNIT {prev.id}</a> : <span />}
        {next ? <a className="btn" href={`#/unit/${next.id}`}>UNIT {next.id} →</a> : <span />}
      </footer>
    </article>
  )
}

function Empty({ unit, what }) {
  return (
    <div className="empty glass">
      <p>아직 {what}이(가) 없어요.</p>
      <a className="btn primary" href={`#/unit/${unit.id}/add`}>Gemini로 만들어서 추가하기</a>
    </div>
  )
}

// **굵게**, "- " 목록, 빈 줄 문단만 지원하는 가벼운 렌더러
function Rich({ text }) {
  const inline = (s) =>
    s.split(/(\*\*[^*]+\*\*)/g).map((t, i) =>
      t.startsWith('**') ? <strong key={i}>{t.slice(2, -2)}</strong> : t,
    )
  const blocks = String(text).split(/\n{2,}/)
  return blocks.map((b, i) => {
    const lines = b.split('\n')
    if (lines.every((l) => /^\s*-\s/.test(l)))
      return (
        <ul key={i}>
          {lines.map((l, j) => (
            <li key={j}>{inline(l.replace(/^\s*-\s/, ''))}</li>
          ))}
        </ul>
      )
    return (
      <p key={i}>
        {lines.map((l, j) => (
          <span key={j}>
            {inline(l)}
            {j < lines.length - 1 && <br />}
          </span>
        ))}
      </p>
    )
  })
}

function Explain({ content, unit }) {
  if (!content.sections?.length) return <Empty unit={unit} what="설명" />
  return (
    <div className="stack">
      {content.sections.map((s, i) => (
        <section key={i} className="card glass rich">
          <h2>{s.heading}</h2>
          <Rich text={s.body} />
        </section>
      ))}
    </div>
  )
}

const speak = (text) => {
  speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text.replace(/\*\*/g, ''))
  u.lang = 'en-US'
  u.rate = 0.9
  speechSynthesis.speak(u)
}

function Examples({ content, unit }) {
  const [hide, setHide] = useState(false)
  const [open, setOpen] = useState({})
  if (!content.examples?.length) return <Empty unit={unit} what="예문" />
  return (
    <>
      <div className="toolbar">
        <label className="switch">
          <input id="hide-ko" type="checkbox" checked={hide} onChange={(e) => { setHide(e.target.checked); setOpen({}) }} />
          해석 가리기 (눌러서 확인)
        </label>
      </div>
      <ol className="examples">
        {content.examples.map((ex, i) => {
          const shown = !hide || open[i]
          return (
            <li key={i} className="glass">
              <span className="no">{i + 1}</span>
              <div className="ex-body" onClick={() => setOpen((o) => ({ ...o, [i]: !o[i] }))}>
                <p className="en"><Rich text={ex.en} /></p>
                <p className={`ko ${shown ? '' : 'blur'}`}>{ex.ko}</p>
              </div>
              <button className="icon-btn" aria-label="발음 듣기" onClick={() => speak(ex.en)}>🔊</button>
            </li>
          )
        })}
      </ol>
    </>
  )
}

const norm = (s) => String(s).trim().toLowerCase().replace(/[.!?]+$/, '').replace(/\s+/g, ' ')
const isCorrect = (q, given) =>
  q.type === 'choice'
    ? given === q.answer
    : [q.answer, ...(q.answers ?? [])].some((a) => norm(a) === norm(given))

function Quiz({ content, unit, results }) {
  const qs = content.questions
  const [cur, setCur] = useState(() => {
    const first = qs?.findIndex((_, i) => !results[i])
    return first >= 0 ? first : 0
  })
  const [input, setInput] = useState('')
  const [review, setReview] = useState(false)
  if (!qs?.length) return <Empty unit={unit} what="문제" />

  const answered = Object.keys(results).length
  const correct = Object.values(results).filter((r) => r.correct).length
  const wrong = qs.map((_, i) => i).filter((i) => results[i] && !results[i].correct)
  const q = qs[cur]
  const res = results[cur]

  const submit = (given) => {
    if (res) return
    recordAnswer(unit.id, cur, { given, correct: isCorrect(q, given) })
  }
  const go = (i) => {
    setCur(i)
    setInput('')
  }

  if (answered === qs.length && review) {
    return (
      <div className="card glass center">
        <h2>🎉 결과: {correct} / {qs.length}</h2>
        <p className="muted">틀린 문제 {wrong.length}개</p>
        <div className="row">
          {wrong.length > 0 && (
            <button className="btn primary" id="retry-wrong" onClick={() => { resetQuiz(unit.id, true); setReview(false); go(wrong[0]) }}>
              틀린 문제만 다시 풀기
            </button>
          )}
          <button className="btn" id="retry-all" onClick={() => { resetQuiz(unit.id); setReview(false); go(0) }}>
            처음부터 다시
          </button>
          <button className="btn" onClick={() => setReview(false)}>문제 보기</button>
        </div>
      </div>
    )
  }

  return (
    <div className="quiz">
      <div className="quiz-top">
        <div className="bar"><i style={{ width: `${(answered / qs.length) * 100}%` }} /></div>
        <span>
          {answered}/{qs.length} 풀이 · 정답 {correct}
        </span>
      </div>
      <div className="dots">
        {qs.map((_, i) => (
          <button
            key={i}
            aria-label={`${i + 1}번 문제`}
            className={`dot ${i === cur ? 'cur' : ''} ${results[i] ? (results[i].correct ? 'ok' : 'no') : ''}`}
            onClick={() => go(i)}
          />
        ))}
      </div>

      <section className="card glass">
        <span className="chip">Q{cur + 1}</span>
        <h2 className="question"><Rich text={q.question} /></h2>

        {q.type === 'choice' ? (
          <div className="choices">
            {q.choices.map((c, i) => {
              let state = ''
              if (res) state = i === q.answer ? 'right' : i === res.given ? 'wrong' : 'dim'
              return (
                <button key={i} className={`choice ${state}`} disabled={!!res} onClick={() => submit(i)}>
                  <b>{'ABCD'[i]}</b> {c}
                </button>
              )
            })}
          </div>
        ) : (
          <form
            className="blank"
            onSubmit={(e) => { e.preventDefault(); if (input.trim()) submit(input) }}
          >
            <input
              id="blank-input"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck="false"
              disabled={!!res}
              value={res ? res.given : input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="정답을 입력하고 Enter"
              className={res ? (res.correct ? 'right' : 'wrong') : ''}
            />
            {!res && <button className="btn primary" disabled={!input.trim()}>확인</button>}
          </form>
        )}

        {res && (
          <div className={`feedback ${res.correct ? 'ok' : 'no'}`}>
            <strong>{res.correct ? '정답! 🎯' : '오답 😅'}</strong>
            {!res.correct && q.type === 'blank' && <p>정답: <b>{q.answer}</b></p>}
            <Rich text={q.explanation} />
          </div>
        )}
      </section>

      <div className="pager">
        <button className="btn" disabled={cur === 0} onClick={() => go(cur - 1)}>← 이전</button>
        {answered === qs.length ? (
          <button className="btn primary" id="show-result" onClick={() => setReview(true)}>결과 보기</button>
        ) : (
          <button className="btn" disabled={cur === qs.length - 1} onClick={() => go(cur + 1)}>다음 →</button>
        )}
      </div>
      {wrong.length > 0 && answered < qs.length && (
        <p className="muted center">오답 노트: {wrong.map((i) => i + 1).join(', ')}번</p>
      )}
    </div>
  )
}

function CopyBox({ title, text, id }) {
  const [copied, setCopied] = useState(false)
  return (
    <div className="card glass">
      <div className="row between">
        <h3>{title}</h3>
        <button
          id={id}
          className="btn primary"
          onClick={async () => {
            await navigator.clipboard.writeText(text)
            setCopied(true)
            setTimeout(() => setCopied(false), 1500)
          }}
        >
          {copied ? '복사됨 ✔' : '프롬프트 복사'}
        </button>
      </div>
      <pre className="prompt">{text}</pre>
    </div>
  )
}

function AddContent({ unit, content }) {
  const [text, setText] = useState('')
  const [msg, setMsg] = useState(null)

  const save = async () => {
    try {
      const parsed = parseContentJson(text)
      const { file } = await saveContent(unit.id, parsed)
      const parts = [
        parsed.sections && `설명 ${parsed.sections.length}개`,
        parsed.examples && `예문 ${parsed.examples.length}개`,
        parsed.questions && `문제 ${parsed.questions.length}개`,
      ].filter(Boolean)
      setMsg({ ok: true, text: `${file} 에 저장 완료: ${parts.join(', ')}` })
      setText('')
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    }
  }

  return (
    <div className="stack">
      <ol className="steps glass card">
        <li><a href="https://gemini.google.com" target="_blank" rel="noreferrer">gemini.google.com</a> 을 열어요.</li>
        <li>아래 프롬프트를 복사해서 붙여넣어요. (설명+예문, 문제는 따로 요청해야 안 잘려요)</li>
        <li>Gemini가 준 JSON 답변을 통째로 복사해서 아래에 붙여넣고 저장!</li>
      </ol>
      <CopyBox id="copy-explain" title="① 설명 + 예문 50개" text={buildExplainPrompt(unit)} />
      <CopyBox id="copy-quiz" title="② 문제 50개" text={buildQuizPrompt(unit)} />

      <div className="card glass">
        <h3>Gemini 답변 붙여넣기</h3>
        <textarea
          id="paste-json"
          rows={8}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='```json { "unit": ... } ```'
        />
        <div className="row">
          <button className="btn primary" id="save-json" disabled={!text.trim()} onClick={save}>저장</button>
          <button
            className="btn"
            onClick={async () => {
              if (!confirm('이 UNIT의 저장된 콘텐츠 파일을 삭제할까요?')) return
              try {
                await clearContent(unit.id)
                setMsg(null)
              } catch (e) {
                setMsg({ ok: false, text: e.message })
              }
            }}
          >
            붙여넣은 콘텐츠 삭제
          </button>
        </div>
        {msg && <p className={msg.ok ? 'ok-text' : 'err-text'}>{msg.text}</p>}
        <p className="muted small">
          현재: 설명 {content.sections?.length ?? 0}개 · 예문 {content.examples?.length ?? 0}개 · 문제 {content.questions?.length ?? 0}개.
          저장하면 <code>src/content/unit-{String(unit.id).padStart(2, '0')}.json</code> 파일에 기록돼요.
        </p>
      </div>
    </div>
  )
}
