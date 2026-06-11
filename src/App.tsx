import { useState, useEffect } from 'react'
import LandingScreen from './screens/LandingScreen'
import ConsentScreen from './screens/ConsentScreen'
import DemographicsScreen from './screens/DemographicsScreen'
import GroupScreen from './screens/GroupScreen'
import WaitingScreen from './screens/WaitingScreen'
import Part1Screen from './screens/Part1Screen'
import BreakScreen from './screens/BreakScreen'
import Part2Screen from './screens/Part2Screen'
import ResultsScreen from './screens/ResultsScreen'
import AdminLoginScreen from './screens/AdminLoginScreen'
import AdminConsoleScreen from './screens/AdminConsoleScreen'
import { supabase } from './data/dataClient'

// ── Admin app (gated by Supabase Auth) ───────────────────────────────────────

function AdminApp() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setLoggedIn(!!session)
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setLoggedIn(!!session)
    })
    return () => subscription.unsubscribe()
  }, [])

  if (loggedIn === null) {
    return (
      <div className="screen" style={{ paddingTop: '3rem', textAlign: 'center' }}>
        <p className="prose">Loading…</p>
      </div>
    )
  }

  if (!loggedIn) {
    return <AdminLoginScreen onSignedIn={() => { /* onAuthStateChange updates loggedIn */ }} />
  }

  return <AdminConsoleScreen onSignOut={() => { /* onAuthStateChange updates loggedIn */ }} />
}

// ── Participant app ───────────────────────────────────────────────────────────

type Screen =
  | 'landing'
  | 'consent'
  | 'demographics'
  | 'group'
  | 'waiting'
  | 'part1'
  | 'part1_done'
  | 'part2'
  | 'results'

const SS = {
  code: 'vc_code',
  seed: 'vc_seed',
  screen: 'vc_screen',
  group: 'vc_group',
} as const

function readSession(): { screen: Screen; code: string; seed: number; group: string } {
  const code = sessionStorage.getItem(SS.code) ?? ''
  const seed = Number(sessionStorage.getItem(SS.seed) ?? '0')
  const screen = (sessionStorage.getItem(SS.screen) as Screen | null) ?? 'landing'
  const group = sessionStorage.getItem(SS.group) ?? ''
  const effectiveScreen = code && screen === 'landing' ? 'consent' : screen
  return { screen: effectiveScreen, code, seed, group }
}

function persist(updates: Partial<{ screen: Screen; code: string; seed: number; group: string }>) {
  if (updates.screen !== undefined) sessionStorage.setItem(SS.screen, updates.screen)
  if (updates.code !== undefined) sessionStorage.setItem(SS.code, updates.code)
  if (updates.seed !== undefined) sessionStorage.setItem(SS.seed, String(updates.seed))
  if (updates.group !== undefined) sessionStorage.setItem(SS.group, updates.group)
}

function ParticipantApp() {
  const selfPaced = import.meta.env.VITE_SELF_PACED === 'true'
  const initial = readSession()
  const [screen, setScreen] = useState<Screen>(initial.screen)
  const [participantCode, setParticipantCode] = useState(initial.code)
  const [group, setGroupState] = useState(initial.group)

  function goTo(next: Screen, extras?: { code?: string; seed?: number; group?: string }) {
    persist({ screen: next, ...extras })
    if (extras?.code) setParticipantCode(extras.code)
    if (extras?.group) setGroupState(extras.group)
    setScreen(next)
  }

  switch (screen) {
    case 'landing':
      return (
        <LandingScreen
          onStarted={(code, seed) => goTo('consent', { code, seed })}
        />
      )

    case 'consent':
      return (
        <ConsentScreen
          participantCode={participantCode}
          onConsented={() => goTo('demographics')}
        />
      )

    case 'demographics':
      return (
        <DemographicsScreen
          participantCode={participantCode}
          onCompleted={() => goTo('group')}
        />
      )

    case 'group':
      return (
        <GroupScreen
          participantCode={participantCode}
          onGroupSet={(g) => goTo(selfPaced ? 'part1' : 'waiting', { group: g })}
        />
      )

    case 'waiting':
      return (
        <WaitingScreen
          participantCode={participantCode}
          group={group}
          onPhaseOpen={() => goTo('part1')}
        />
      )

    case 'part1':
      return (
        <Part1Screen
          participantCode={participantCode}
          group={group}
          onDone={() => goTo('part1_done')}
        />
      )

    case 'part1_done':
      return (
        <BreakScreen
          participantCode={participantCode}
          selfPaced={selfPaced}
          onPart2Open={() => goTo('part2')}
        />
      )

    case 'part2':
      return (
        <Part2Screen
          participantCode={participantCode}
          onDone={() => goTo('results')}
        />
      )

    case 'results':
      return (
        <ResultsScreen
          participantCode={participantCode}
          group={group}
          selfPaced={selfPaced}
        />
      )
  }
}

// ── Top-level router: /admin → AdminApp, everything else → ParticipantApp ─────

export default function App() {
  const isAdmin = window.location.pathname.startsWith('/admin')
  return isAdmin ? <AdminApp /> : <ParticipantApp />
}
