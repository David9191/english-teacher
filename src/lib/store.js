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

// ---- 학습 콘텐츠 (파일이 원본, 저장 직후엔 메모리에 즉시 반영) ----
// 저장은 /api/content/:id 로 src/content/unit-XX.json 파일에 기록됨.
// runtime: 저장 직후 파일 HMR 반영 전까지 보여줄 임시 값. legacy: 예전 localStorage 값(이전 전까지).
const runtime = {}
export function getContent(id) {
  const legacy = read(CONTENT_KEY, {})[id] ?? {}
  return { ...(fileContent[id] ?? {}), ...legacy, ...(runtime[id] ?? {}) }
}
export function useContent(id) {
  return useStoreValue(() => getContent(id))
}
async function callContentApi(id, method, body) {
  const res = await fetch(`/api/content/${id}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error?.message || `파일 저장 실패 (${res.status})`)
  return data
}
export async function saveContent(id, partial) {
  const data = await callContentApi(id, 'POST', partial)
  runtime[id] = { ...(runtime[id] ?? {}), ...partial }
  emit()
  return data
}
export async function clearContent(id) {
  await callContentApi(id, 'DELETE')
  const all = read(CONTENT_KEY, {})
  if (all[id]) {
    delete all[id]
    localStorage.setItem(CONTENT_KEY, JSON.stringify(all))
  }
  delete fileContent[id]
  runtime[id] = { sections: undefined, examples: undefined, questions: undefined }
  emit()
}

// 예전에 localStorage에 저장된 콘텐츠를 파일로 한 번 옮김
async function migrateLegacyContent() {
  const all = read(CONTENT_KEY, {})
  for (const id of Object.keys(all)) {
    try {
      await saveContent(id, all[id])
      delete all[id]
    } catch (e) {
      console.warn(`UNIT ${id} 파일 이전 실패:`, e.message)
    }
  }
  if (Object.keys(all).length) localStorage.setItem(CONTENT_KEY, JSON.stringify(all))
  else localStorage.removeItem(CONTENT_KEY)
}
if (typeof window !== 'undefined') migrateLegacyContent()

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
