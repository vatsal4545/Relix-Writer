import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '../api/client';
import type { User } from '../api/types';

/**
 * Multi-step signup that captures the "Brain" — the company context that
 * gets injected into every agent system prompt. The agent literally
 * cannot ask 'what does your company do?' because we collect it here.
 */
type Form = {
  name: string;
  email: string;
  password: string;
  company_name: string;
  company_description: string;
  industry: string;
  target_audience: string;
  brand_voice: string;
};

const initial: Form = {
  name: '',
  email: '',
  password: '',
  company_name: '',
  company_description: '',
  industry: '',
  target_audience: '',
  brand_voice: '',
};

export default function SignupPage() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Form>(initial);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const totalSteps = 4;

  const canAdvance = () => {
    if (step === 0) return form.name && form.email && form.password.length >= 6;
    if (step === 1) return !!form.company_name;
    if (step === 2) return true;
    return true;
  };

  async function submit() {
    setError(null);
    setSubmitting(true);
    try {
      const res = await api<{ user: User }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      // Wipe any cache that belonged to a previous user before priming
      // ['me'] with the new one — otherwise the new user sees stale data
      // on first render.
      qc.clear();
      qc.setQueryData(['me'], res.user);
      navigate('/planner', { replace: true });
    } catch (e: any) {
      setError(e instanceof ApiError ? e.message : 'signup failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <h1>Meet <span style={{ color: 'var(--accent)' }}>Relix</span></h1>
        <p className="subtitle">Your AI content-writing partner. Tell us about your company so Relix can skip the small talk.</p>

        <div className="steps">
          {Array.from({ length: totalSteps }).map((_, i) => (
            <div key={i} className={`step ${i <= step ? 'active' : ''}`} />
          ))}
        </div>

        {error && <div className="error-banner">{error}</div>}

        {step === 0 && (
          <>
            <div className="field">
              <label>Your name</label>
              <input value={form.name} onChange={set('name')} placeholder="Jane Doe" />
            </div>
            <div className="field">
              <label>Email</label>
              <input type="email" value={form.email} onChange={set('email')} placeholder="jane@acme.com" />
            </div>
            <div className="field">
              <label>Password</label>
              <input type="password" value={form.password} onChange={set('password')} placeholder="At least 6 characters" />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <div className="field">
              <label>Company name</label>
              <input value={form.company_name} onChange={set('company_name')} placeholder="Acme Corp" />
            </div>
            <div className="field">
              <label>What does your company do?</label>
              <textarea
                value={form.company_description}
                onChange={set('company_description')}
                placeholder="We sell widgets to small businesses..."
                rows={3}
              />
            </div>
            <div className="field">
              <label>Industry</label>
              <input value={form.industry} onChange={set('industry')} placeholder="Manufacturing, SaaS, Healthcare..." />
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <div className="field">
              <label>Target audience</label>
              <textarea
                value={form.target_audience}
                onChange={set('target_audience')}
                placeholder="Operations managers at small businesses..."
                rows={3}
              />
            </div>
            <div className="field">
              <label>Brand voice</label>
              <textarea
                value={form.brand_voice}
                onChange={set('brand_voice')}
                placeholder="Friendly, practical, no buzzwords..."
                rows={3}
              />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <p style={{ color: 'var(--text-dim)', lineHeight: 1.5 }}>
              We'll feed all of this into Relix's brain so it understands your
              company without you repeating yourself. Ready?
            </p>
            <div className="card" style={{ marginTop: 12 }}>
              <strong>{form.name}</strong> @ <strong>{form.company_name || '—'}</strong>
              <div style={{ color: 'var(--text-dim)', fontSize: 13, marginTop: 4 }}>{form.email}</div>
              <div style={{ marginTop: 8, fontSize: 13 }}>{form.company_description || '(no description)'}</div>
            </div>
          </>
        )}

        <div className="row">
          {step > 0 ? (
            <button className="secondary" onClick={() => setStep((s) => s - 1)} disabled={submitting}>
              Back
            </button>
          ) : (
            <Link to="/login"><button className="secondary">Have an account?</button></Link>
          )}
          {step < totalSteps - 1 ? (
            <button onClick={() => setStep((s) => s + 1)} disabled={!canAdvance() || submitting}>
              Next
            </button>
          ) : (
            <button onClick={submit} disabled={submitting}>
              {submitting ? 'Creating…' : 'Enter Planner'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
