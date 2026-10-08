import { useMemo, useState } from 'react'
import units from '../data/units.json'
import { allUnits, contentStatus, useProgress, useContent } from '../lib/store'

export default function Home() {
  const progress = useProgress()
  const [q, setQ] = useState('')
  const doneCount = allUnits.filter((u) => progress.done[u.id]).length
  const pct = Math.round((doneCount / allUnits.length) * 100)
  const next = allUnits.find((u) => !progress.done[u.id]) ?? allUnits[0]

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase()
    if (!k) return units
    return units
      .map((p) => ({
        ...p,
        chapters: p.chapters
          .map((c) => ({
            ...c,
            units: c.units.filter((u) =>
              `${u.id} ${u.title} ${u.topics.join(' ')}`.toLowerCase().includes(k),
            ),
          }))
          .filter((c) => c.units.length),
      }))
      .filter((p) => p.chapters.length)
  }, [q])

  return (
    <>
      <section className="hero glass">
        <div>
          <h1>나만의 영문법 선생님</h1>
          <p className="muted">
            UNIT마다 자세한 설명 · 예문 50개 · 문제 50개. 하나씩 끝내고 ✔ 표시해 보세요.
          </p>
          <a className="btn primary" id="continue-btn" href={`#/unit/${next.id}`}>
            {doneCount ? '이어서 공부하기' : '첫 UNIT 시작하기'} · UNIT {next.id}
          </a>
        </div>
        <div className="ring" style={{ '--pct': pct }} role="img" aria-label={`진도 ${pct}%`}>
          <div>
            <strong>{pct}%</strong>
            <span>
              {doneCount} / {allUnits.length}
            </span>
          </div>
        </div>
      </section>

      <label className="search glass" htmlFor="unit-search">
        <span aria-hidden="true">🔍</span>
        <input
          id="unit-search"
          type="search"
          placeholder="UNIT 번호, 제목, 키워드 검색 (예: 분사, 관계대명사)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </label>

      {filtered.map((p) => (
        <section key={p.id} className="part">
          <h2>
            <span className="chip">PART {p.id}</span> {p.title}
          </h2>
          {p.chapters.map((c) => (
            <div key={c.id} className="chapter">
              <h3>
                CHAPTER {String(c.id).padStart(2, '0')} · {c.title}
              </h3>
              <div className="unit-grid">
                {c.units.map((u) => (
                  <UnitCard key={u.id} u={u} done={!!progress.done[u.id]} />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
      {!filtered.length && <p className="muted center">검색 결과가 없어요.</p>}
    </>
  )
}

function UnitCard({ u, done }) {
  useContent(u.id) // 콘텐츠 변경 시 갱신
  const s = contentStatus(u.id)
  const ready = s.explain || s.examples || s.questions
  return (
    <a href={`#/unit/${u.id}`} id={`unit-card-${u.id}`} className={`unit-card glass ${done ? 'done' : ''}`}>
      <div className="unit-head">
        <span className="unit-no">UNIT {String(u.id).padStart(2, '0')}</span>
        {done && <span className="check">✔</span>}
      </div>
      <h4>{u.title}</h4>
      <p className="topics">{u.topics.slice(0, 3).join(' · ')}</p>
      <div className="badges">
        <span className={s.explain ? 'on' : ''}>설명</span>
        <span className={s.examples ? 'on' : ''}>예문 {s.examples || '-'}</span>
        <span className={s.questions ? 'on' : ''}>문제 {s.questions || '-'}</span>
        {!ready && <em>콘텐츠 준비 전</em>}
      </div>
    </a>
  )
}
