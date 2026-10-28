import { useHash } from './lib/store'
import Home from './pages/Home.jsx'
import UnitPage from './pages/UnitPage.jsx'
import Chat from './pages/Chat.jsx'

export default function App() {
  const hash = useHash()
  const m = hash.match(/^\/unit\/(\d+)(?:\/(\w+))?$/)
  const isChat = import.meta.env.DEV && hash.startsWith('/chat')

  return (
    <>
      <div className="bg-orbs" aria-hidden="true" />
      <header className="topbar">
        <div className="topbar-inner">
          <a href="#/" className="brand" id="brand-link">
            <span className="brand-mark">Aa</span>
            <span>
              My English Teacher
              <small>강성태 영문법 필수편</small>
            </span>
          </a>
          <nav className="nav" aria-label="사이트 메뉴">
            <a id="nav-study" href="#/" className={!isChat ? 'active' : ''}>문법 학습</a>
            {import.meta.env.DEV && (
              <a id="nav-chat" href="#/chat" className={isChat ? 'active' : ''}>AI 채팅</a>
            )}
          </nav>
        </div>
      </header>
      <main className="container">
        {isChat ? <Chat /> : m ? <UnitPage key={m[1]} id={m[1]} tab={m[2] ?? 'explain'} /> : <Home />}
      </main>
    </>
  )
}
