import { getSections } from '../content/groupBriefings'

interface Props {
  participantCode: string
  group: 'A' | 'B' | 'C'
  onContinue: () => void
}

export default function GroupBriefingScreen({ participantCode, group, onContinue }: Props) {
  const sections = getSections(group)

  return (
    <div className="screen">
      <div className="code-bar">
        <span>Your participant code:</span>
        <strong>{participantCode}</strong>
      </div>

      <h1 className="screen-title">Group {group} — Briefing</h1>
      <p className="screen-sub">Read the information below before you begin.</p>

      {sections.map((section) => (
        <div key={section.heading} className="card">
          <p className="section-label">{section.heading}</p>
          <div className="prose">
            {section.paragraphs.map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      ))}

      <button className="btn btn-primary btn-full btn-lg" onClick={onContinue}>
        Continue
      </button>
    </div>
  )
}
