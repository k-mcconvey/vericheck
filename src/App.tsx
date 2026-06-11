import { useState } from 'react'
import LandingScreen from './screens/LandingScreen'
import ConsentScreen from './screens/ConsentScreen'
import DemographicsScreen from './screens/DemographicsScreen'
import GroupScreen from './screens/GroupScreen'
import WaitingScreen from './screens/WaitingScreen'
import Part1Screen from './screens/Part1Screen'
import BreakScreen from './screens/BreakScreen'
import Part2Screen from './screens/Part2Screen'

type Screen =
  | 'landing'
  | 'consent'
  | 'demographics'
  | 'group'
  | 'waiting'
  | 'part1'
  | 'part1_done'
  | 'part2'
  | 'done'

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

export default function App() {
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
          onGroupSet={(g) => goTo('waiting', { group: g })}
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
          onPart2Open={() => goTo('part2')}
        />
      )

    case 'part2':
      return (
        <Part2Screen
          participantCode={participantCode}
          onDone={() => goTo('done')}
        />
      )

    case 'done':
      return (
        <div className="screen" style={{ textAlign: 'center', paddingTop: '3rem' }}>
          <div className="code-bar" style={{ justifyContent: 'center' }}>
            <span>Your participant code:</span>
            <strong>{participantCode}</strong>
          </div>
          <div className="card" style={{ textAlign: 'center' }}>
            <div className="waiting-icon">🎉</div>
            <h2 style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              All done — thank you!
            </h2>
            <p className="prose" style={{ marginBottom: '1rem' }}>
              You have completed both parts. Your results will be available shortly.
              Please wait for the facilitator's instructions.
            </p>
          </div>
          <div className="card" style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            <p>
              Withdrawal window: 7 days. Your code:{' '}
              <strong style={{ color: '#38bdf8' }}>{participantCode}</strong>
            </p>
          </div>
        </div>
      )
  }
}
