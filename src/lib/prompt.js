// Gemini 웹(gemini.google.com)에 붙여넣을 프롬프트 생성기
const unitLine = (u) =>
  `- 교재: 강성태 영문법 필수편\n- UNIT ${u.id}: ${u.title}\n- 세부 목차: ${u.topics.join(' / ')}\n- 챕터: ${u.chapter.title}`

const RULES = `규칙:
- 출력은 오직 하나의 JSON 코드블록(\`\`\`json)만. 설명 문장 금지.
- 한국어로 설명하되 영어 예문은 자연스럽고 실제로 쓰이는 문장으로.
- 문자열 안에 줄바꿈은 \\n 으로, 큰따옴표는 \\" 로 이스케이프.`

export function buildExplainPrompt(u) {
  return `너는 영문법 전문 강사야. 아래 UNIT의 "자세한 설명 + 예문 50개"를 만들어줘.

${unitLine(u)}

${RULES}
- sections: 세부 목차 항목마다 1개 이상. 각 body 는 개념, 규칙, 주의점, 헷갈리는 포인트를 초보자가 이해하도록 자세히. 강조는 **굵게**, 목록은 줄 앞에 "- " 사용.
- examples: 정확히 50개. 세부 목차를 골고루 다루고, 쉬운 문장에서 어려운 문장 순서로. 핵심 문법 부분은 **굵게** 표시.

JSON 형식:
{
  "unit": ${u.id},
  "summary": "한 줄 요약",
  "sections": [ { "heading": "소제목", "body": "설명 본문" } ],
  "examples": [ { "en": "영어 예문", "ko": "한국어 해석" } ]
}`
}

export function buildQuizPrompt(u) {
  return `너는 영문법 출제위원이야. 아래 UNIT의 "문제 정확히 50개"를 만들어줘.

${unitLine(u)}

${RULES}
- 세부 목차를 골고루 다루고 난이도는 쉬움 → 어려움 순서.
- type "choice": 4지선다. choices 는 4개 문자열, answer 는 정답 번호(0~3 정수).
- type "blank": 빈칸 채우기. question 에 "____" 사용, answer 는 정답 문자열(소문자, 필요하면 answers 배열로 허용 답안 추가).
- 2/3 는 choice, 1/3 은 blank 로 섞기.
- 모든 문제에 한국어 explanation(정답 이유 + 해석) 필수.

JSON 형식:
{
  "unit": ${u.id},
  "questions": [
    { "type": "choice", "question": "문제", "choices": ["a","b","c","d"], "answer": 0, "explanation": "해설" },
    { "type": "blank", "question": "She ____ (go) to school.", "answer": "goes", "explanation": "해설" }
  ]
}`
}

// 붙여넣은 텍스트에서 JSON 추출 + 검증
export function parseContentJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  const body = (fenced ? fenced[1] : text).trim()
  let data
  try {
    data = JSON.parse(body)
  } catch (e) {
    throw new Error('JSON 형식이 올바르지 않아요: ' + e.message)
  }
  const out = {}
  if (Array.isArray(data.sections)) out.sections = data.sections
  if (data.summary) out.summary = data.summary
  if (Array.isArray(data.examples)) out.examples = data.examples
  if (Array.isArray(data.questions)) out.questions = data.questions
  if (!Object.keys(out).length) throw new Error('sections / examples / questions 중 하나는 있어야 해요.')
  return out
}
