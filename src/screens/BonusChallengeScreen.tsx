import type { ReactNode } from 'react'

const DETECTOR_URL = 'https://sadjadeb--ai-generated-image-detection-ui.modal.run/'
const SOURCE_IMAGE = '/stimuli/source.png'
const TARGET_SCORE = 0.56

interface Props {
  onBack: () => void
}

export default function BonusChallengeScreen({ onBack }: Props) {
  return (
    <div className="screen">
      <button
        className="btn btn-secondary"
        onClick={onBack}
        style={{ marginBottom: '1.5rem' }}
      >
        ← Back
      </button>

      <h1 className="screen-title">Bonus challenge: can you fool the detector?</h1>
      <p className="screen-sub">
        You've spent this session judging the detector — now flip roles and try to beat it.
      </p>

      <div className="card">
        <p className="section-label">Source image</p>
        <div
          className="p1-image-wrap"
          style={{ borderRadius: 6, overflow: 'hidden', marginBottom: '1rem' }}
        >
          <img
            src={SOURCE_IMAGE}
            alt="Source image for the bonus challenge"
            className="p1-image"
          />
        </div>
        <a href={SOURCE_IMAGE} download className="btn btn-secondary btn-full">
          Download source image
        </a>
      </div>

      <div className="card">
        <p className="section-label">Steps</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
          <Step n={1}>Download the source image using the button above.</Step>
          <Step n={2}>
            Use any generative-AI image tool to add an obstruction to the scene.
          </Step>
          <Step n={3}>
            <span>Upload your edited image to the detector.</span>
            <a
              href={DETECTOR_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary"
              style={{ marginTop: '0.5rem', fontSize: '0.9rem', padding: '0.55rem 1.1rem' }}
            >
              Open detector in new tab ↗
            </a>
          </Step>
          <Step n={4}>Check the score you receive.</Step>
        </div>
      </div>

      <div className="card" style={{ background: '#0c1a2e', borderColor: '#1e3a5f' }}>
        <p className="section-label">The target</p>
        <p
          style={{
            fontSize: '2.5rem',
            fontWeight: 800,
            color: '#38bdf8',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1,
            margin: '0.25rem 0 0.75rem',
          }}
        >
          {TARGET_SCORE}
        </p>
        <p className="prose">
          <strong>Lower is better</strong> — the lower the score, the more you've fooled the
          detector. Our team couldn't get below{' '}
          <strong style={{ color: '#38bdf8' }}>{TARGET_SCORE}</strong> — can you beat that?
        </p>
      </div>
    </div>
  )
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: '0.85rem', alignItems: 'flex-start' }}>
      <span
        style={{
          flexShrink: 0,
          width: '1.6rem',
          height: '1.6rem',
          borderRadius: '50%',
          background: '#1e3a5f',
          border: '1px solid #3b82f6',
          color: '#93c5fd',
          fontSize: '0.8rem',
          fontWeight: 700,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: '0.15rem',
        }}
      >
        {n}
      </span>
      <div className="prose" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {children}
      </div>
    </div>
  )
}
