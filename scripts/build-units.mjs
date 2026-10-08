// code_artifact.md(목차) → src/data/units.json 변환 스크립트
// 실행: node scripts/build-units.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'

const md = readFileSync(new URL('../code_artifact.md', import.meta.url), 'utf8')
const parts = []
let part = null
let chapter = null

for (const raw of md.split('\n')) {
  const line = raw.trim()
  let m
  if ((m = line.match(/^## PART (\d+)\s+(.+)$/))) {
    part = { id: Number(m[1]), title: m[2], chapters: [] }
    parts.push(part)
    chapter = null
  } else if ((m = line.match(/^### CHAPTER (\d+)\.\s+(.+)$/))) {
    chapter = { id: Number(m[1]), title: m[2], units: [] }
    part?.chapters.push(chapter)
  } else if ((m = line.match(/^- \*\*UNIT (\d+)\*\*\s+(.+)$/)) && chapter) {
    const cells = m[2].split('|').map((s) => s.trim())
    const page = /^\d+$/.test(cells.at(-1)) ? Number(cells.pop()) : null
    const [title, ...topics] = cells
    chapter.units.push({ id: Number(m[1]), title, topics, page })
  } else if ((m = line.match(/^- \*\*이것만은 꼭!\*\*\s+(.+)$/)) && chapter) {
    // "이것만은 꼭!" 요약 코너는 별도 UNIT이 아니므로 챕터 메모로만 보관
    chapter.extra = m[1].replace(/\|\s*\d+$/, '').trim()
  }
}

mkdirSync(new URL('../src/data/', import.meta.url), { recursive: true })
writeFileSync(
  new URL('../src/data/units.json', import.meta.url),
  JSON.stringify(parts, null, 2) + '\n',
)
const total = parts.flatMap((p) => p.chapters.flatMap((c) => c.units)).length
console.log(`PART ${parts.length}개 / UNIT ${total}개 → src/data/units.json`)
