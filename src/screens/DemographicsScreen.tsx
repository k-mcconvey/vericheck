import { useState } from 'react'
import { submitDemographics, type DemographicsAnswers } from '../data/dataClient'

interface Props {
  participantCode: string
  onCompleted: () => void
}

const ROLES = [
  'Masters student',
  'PhD student',
  'Postdoctoral researcher',
  'Faculty/academic researcher',
  'Legal professional',
  'Judicial officer',
  'Policy professional',
  'Other',
]

const AI_FAMILIARITY = [
  'No experience',
  'Heard of, rarely/never used',
  'Use occasionally',
  'Use regularly',
  'Develop/research AI tools professionally',
]

const LEGAL_EXPOSURE = [
  'No exposure',
  'Minimal (media/coursework)',
  'Some direct experience',
  'Substantial professional experience',
]

const PRIOR_AI_RESEARCH = ['Yes', 'No', 'Unsure']

export default function DemographicsScreen({ participantCode, onCompleted }: Props) {
  const [role, setRole] = useState('')
  const [roleOther, setRoleOther] = useState('')
  const [fieldDomain, setFieldDomain] = useState('')
  const [aiFamiliarity, setAiFamiliarity] = useState('')
  const [legalExposure, setLegalExposure] = useState('')
  const [priorAiResearch, setPriorAiResearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const effectiveRole = role === 'Other' ? (roleOther.trim() ? `Other: ${roleOther.trim()}` : '') : role
  const canSubmit =
    effectiveRole !== '' &&
    fieldDomain.trim() !== '' &&
    aiFamiliarity !== '' &&
    legalExposure !== '' &&
    priorAiResearch !== '' &&
    !loading

  async function handleSubmit() {
    if (!canSubmit) return
    setLoading(true)
    setError(null)

    const answers: DemographicsAnswers = {
      role: effectiveRole,
      field_domain: fieldDomain.trim(),
      ai_familiarity: aiFamiliarity,
      legal_exposure: legalExposure,
      prior_ai_research: priorAiResearch,
    }

    const result = await submitDemographics(participantCode, answers)
    setLoading(false)

    if (!result.ok) {
      setError(result.error ?? 'Unknown error')
      return
    }

    onCompleted()
  }

  return (
    <div className="screen">
      <div className="code-bar">
        <span>Your participant code:</span>
        <strong>{participantCode}</strong>
      </div>

      <h1 className="screen-title">Background Survey</h1>
      <p className="screen-sub">
        Five short questions. All answers are anonymized and linked only to your participant code.
      </p>

      <div className="card">
        <div className="field">
          <label htmlFor="role">1. What is your current role?</label>
          <select id="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="">— select —</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {role === 'Other' && (
            <input
              type="text"
              placeholder="Please describe your role"
              value={roleOther}
              onChange={(e) => setRoleOther(e.target.value)}
              style={{ marginTop: '0.5rem' }}
            />
          )}
        </div>

        <div className="field">
          <label htmlFor="field-domain">
            2. What is your primary field of study or professional domain?
          </label>
          <input
            id="field-domain"
            type="text"
            placeholder="e.g. Law, Computer Science, Public Policy"
            value={fieldDomain}
            onChange={(e) => setFieldDomain(e.target.value)}
          />
        </div>

        <div className="field">
          <label htmlFor="ai-familiarity">3. How familiar are you with AI tools?</label>
          <select
            id="ai-familiarity"
            value={aiFamiliarity}
            onChange={(e) => setAiFamiliarity(e.target.value)}
          >
            <option value="">— select —</option>
            {AI_FAMILIARITY.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="legal-exposure">
            4. What is your prior exposure to legal proceedings?
          </label>
          <select
            id="legal-exposure"
            value={legalExposure}
            onChange={(e) => setLegalExposure(e.target.value)}
          >
            <option value="">— select —</option>
            {LEGAL_EXPOSURE.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>

        <div className="field" style={{ marginBottom: 0 }}>
          <label htmlFor="prior-ai-research">
            5. Have you previously participated in research involving AI-assisted
            decision-making?
          </label>
          <select
            id="prior-ai-research"
            value={priorAiResearch}
            onChange={(e) => setPriorAiResearch(e.target.value)}
          >
            <option value="">— select —</option>
            {PRIOR_AI_RESEARCH.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <div className="error-banner">
          <p>Could not save your responses. Please try again or let the facilitator know.</p>
          <p>Detail: {error}</p>
        </div>
      )}

      <button
        className="btn btn-primary btn-full btn-lg"
        onClick={handleSubmit}
        disabled={!canSubmit}
      >
        {loading ? 'Saving…' : 'Continue'}
      </button>
    </div>
  )
}
