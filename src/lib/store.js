import { useEffect, useState, useCallback } from 'react'
import units from '../data/units.json'

const PROGRESS_KEY = 'et-progress-v1'
const CONTENT_KEY = 'et-content-v1'

// 파일로 저장한 콘텐츠: src/content/unit-01.json 처럼 두면 자동 인식
const files = import.meta.glob('../content/unit-*.json', { eager: true })
const fileContent = {}
for (const [path, mod] of Object.entries(files)) {
  const id = Number(path.match(/unit-(\d+)\.json$/)[1])
  fileContent[id] = mod.default ?? mod
}

export const allUnits = units.flatMap((p) =>
  p.chapters.flatMap((c) =>
    c.units.map((u) => ({ ...u, part: p, chapter: { id: c.id, title: c.title } })),
  ),
)
export const getUnit = (id) => allUnits.find((u) => u.id === Number(id))

const read = (key, fallback) => {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback
  } catch {
    return fallback
  }
}

const listeners = new Set()
const emit = () => listeners.forEach((fn) => fn())

function useStoreValue(selector) {
  const [, force] = useState(0)
  useEffect(() => {
    const fn = () => force((n) => n + 1)
    listeners.add(fn)
    return () => listeners.delete(fn)
  }, [])
  return selector()
}

// ---- 학습 콘텐츠 (파일 + 붙여넣기 병합) ----
export function getContent(id) {
  const pasted = read(CONTENT_KEY, {})[id] ?? {}
  return { ...(fileContent[id] ?? {}), ...pasted }
}
export function useContent(id) {
  return useStoreValue(() => getContent(id))
}
export function saveContent(id, partial) {
  const all = read(CONTENT_KEY, {})
  all[id] = { ...(all[id] ?? {}), ...partial }
  localStorage.setItem(CONTENT_KEY, JSON.stringify(all))
  emit()
}
export function clearContent(id) {
  const all = read(CONTENT_KEY, {})
  delete all[id]
  localStorage.setItem(CONTENT_KEY, JSON.stringify(all))
  emit()
}
export function contentStatus(id) {
  const c = getContent(id)
  return {
    explain: !!c.sections?.length,
    examples: c.examples?.length ?? 0,
    questions: c.questions?.length ?? 0,
  }
}

// ---- 학습 진도 ----
const emptyProgress = { done: {}, quiz: {} }
export function useProgress() {
  return useStoreValue(() => read(PROGRESS_KEY, emptyProgress))
}
function updateProgress(fn) {
  const p = read(PROGRESS_KEY, emptyProgress)
  fn(p)
  localStorage.setItem(PROGRESS_KEY, JSON.stringify(p))
  emit()
}
export const toggleDone = (id) =>
  updateProgress((p) => {
    if (p.done[id]) delete p.done[id]
    else p.done[id] = true
  })
export const recordAnswer = (id, idx, result) =>
  updateProgress((p) => {
    p.quiz[id] ??= {}
    p.quiz[id][idx] = result
  })
export const resetQuiz = (id, onlyWrong = false) =>
  updateProgress((p) => {
    if (!onlyWrong) return void delete p.quiz[id]
    for (const [k, v] of Object.entries(p.quiz[id] ?? {})) if (!v.correct) delete p.quiz[id][k]
  })

export function useHash() {
  const get = () => window.location.hash.replace(/^#/, '') || '/'
  const [hash, setHash] = useState(get)
  useEffect(() => {
    const fn = () => {
      setHash(get())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', fn)
    return () => window.removeEventListener('hashchange', fn)
  }, [])
  return hash
}
export const useNavigate = () => useCallback((to) => (window.location.hash = to), [])
