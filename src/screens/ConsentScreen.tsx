import { useState } from 'react'
import { submitConsent } from '../data/dataClient'

interface Props {
  participantCode: string
  onConsented: (consentedResearch: boolean) => void
}

export default function ConsentScreen({ participantCode, onConsented }: Props) {
  const [choice, setChoice] = useState<'research' | 'exercise' | null>(null)
  const [acknowledged, setAcknowledged] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canSubmit = choice !== null && acknowledged && !loading

  async function handleSubmit() {
    if (!canSubmit) return
    setLoading(true)
    setError(null)
    const result = await submitConsent(participantCode, choice === 'research')
    setLoading(false)
    if (!result.ok) {
      setError(result.error ?? 'Unknown error')
      return
    }
    onConsented(choice === 'research')
  }

  return (
    <div className="screen">
      <div className="code-bar">
        <span>Your participant code:</span>
        <strong>{participantCode}</strong>
        <span style={{ color: '#64748b', fontSize: '0.75rem' }}>(keep this for withdrawal)</span>
      </div>

      <h1 className="screen-title">Informed Consent</h1>
      <p className="screen-sub">Please read the following carefully before proceeding.</p>

      <div className="card">
        <div className="prose">
          <p>
            <strong>
              INFORMED CONSENT — Algorithmic Transparency and Trust in AI-Assisted Evidence
              Assessment
            </strong>
          </p>
          <p>
            Principal Investigators: Dr. Ebrahim Bagheri (University of Toronto) and
            Dr. Maura R. Grossman (University of Waterloo)
          </p>

          <hr className="divider" />

          <p>
            <strong>What is this?</strong> You are about to take part in a gamified exercise
            in which you assess whether images and documents submitted as evidence in fictional
            legal cases are authentic or manipulated. You may also interact with an AI
            verification tool as part of the exercise.
          </p>
          <p>
            <strong>Research component.</strong> This exercise is part of a research study
            investigating how people engage with AI-assisted verification tools, including how
            different types of information about the tool affect decision-making. Findings may
            be published in academic venues.
          </p>
          <p>
            <strong>What data will be collected?</strong> If you consent, the following
            anonymized data is included in the research dataset: your task responses
            (judgments, interactions with the AI tool, timestamps, point totals) and your
            demographic survey responses. You are identified only by a randomly assigned code;
            your name is not recorded alongside your task data.
          </p>
          <p>
            <strong>What you should know.</strong> To preserve the integrity of the study,
            certain details about the design will not be disclosed until the debrief, which
            will explain them fully; you may withdraw your data after that disclosure.
          </p>
          <p>
            <strong>The prize.</strong> CIFAR is offering a prize to top performers as part of
            event programming; it is not provided by the research team. You may participate and
            be eligible whether or not you consent to the research.
          </p>
          <p>
            <strong>Your rights.</strong> Research participation is voluntary. You may take
            part in the exercise without consenting to the research. You may withdraw during
            the session by closing the interface, or after the session by contacting the
            research team within seven days. Withdrawal has no effect on your standing at the
            event, your relationship with the research team, or prize eligibility. To withdraw
            after the session, contact:{' '}
            <em>[designated contact name and email]</em>.
          </p>
          <p>
            <strong>Questions?</strong> Ask the facilitator now, or contact the investigators:{' '}
            <em>[PI name, email]</em>. For concerns about your rights as a research
            participant: <em>[REB office name, phone, email]</em>.
          </p>
        </div>
      </div>

      <div className="card">
        <p className="section-label">Consent statements — choose one</p>
        <div className="radio-group">
          <label className={`radio-option${choice === 'research' ? ' checked' : ''}`}>
            <input
              type="radio"
              name="consent"
              value="research"
              checked={choice === 'research'}
              onChange={() => setChoice('research')}
            />
            <span>
              I have read and understood the above and I{' '}
              <strong>consent to having my anonymized task data and survey responses
              included in the research dataset</strong>.
            </span>
          </label>

          <label className={`radio-option${choice === 'exercise' ? ' checked' : ''}`}>
            <input
              type="radio"
              name="consent"
              value="exercise"
              checked={choice === 'exercise'}
              onChange={() => setChoice('exercise')}
            />
            <span>
              I do not wish to participate in the research but would like to{' '}
              <strong>take part in the exercise only</strong>.
            </span>
          </label>
        </div>
      </div>

      <div className="card">
        <p className="section-label">Acknowledgment</p>
        <label className={`checkbox-option${acknowledged ? ' checked' : ''}`}>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(e) => setAcknowledged(e.target.checked)}
          />
          <span>
            I have had the chance to ask questions about the exercise and the research before
            proceeding.
          </span>
        </label>
      </div>

      {error && (
        <div className="error-banner">
          <p>Could not save your consent. Please try again or let the facilitator know.</p>
          <p>Detail: {error}</p>
        </div>
      )}

      <button
        className="btn btn-primary btn-full btn-lg"
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        {loading ? 'Saving…' : 'Continue to survey'}
      </button>
    </div>
  )
}
