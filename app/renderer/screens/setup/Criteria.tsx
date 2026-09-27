import { useMutation, useQueryClient } from '@tanstack/react-query'
import { EyeOff, Lock } from 'lucide-react'
import { useState } from 'react'
import { api, messageOf } from '../../api/client'
import { Banner, Button, Chip, TextArea } from '../../design'
import { SetupBar, useFlow } from './SetupFlow'

const TEMPLATES: Array<{ name: string; text: string }> = [
  {
    name: 'SWE intern',
    text: "Software engineering interns. Must have: solid programming in at least one of Python, Java, C++ or JavaScript, and at least two substantial projects where the student's own contribution is clear. Strong plus: internships, deployed apps, open-source contributions, hackathon wins, data structures and algorithms or competitive programming. Ignore résumé design and formatting.",
  },
  {
    name: 'Data / ML',
    text: 'Data science and machine learning roles. Must have: Python, statistics and SQL, and at least one end-to-end data or ML project with a clear result. Strong plus: internships, Kaggle or research publications, PyTorch or TensorFlow, a deployed model, and a clear account of what the student did themselves.',
  },
  {
    name: 'General graduate',
    text: 'Graduate trainees for a general role. Look for: initiative and ownership (projects, internships, leading a club or event), clear written communication, relevant coursework and consistent results. Real achievements matter more than long lists of skills.',
  },
]

const SHORT = 80

export function Criteria() {
  const { run, next } = useFlow()
  const client = useQueryClient()
  const [text, setText] = useState(run.criteria_prompt)
  const trimmed = text.trim()

  const save = useMutation({
    mutationFn: () => api('PATCH /runs/{run_id}', { params: { run_id: run.id }, body: { criteria_prompt: trimmed } }),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ['run', run.id] })
      next()
    },
  })

  return (
    <>
      <div className="screen-scroll">
        <main className="screen-column">
          <div className="screen-head">
            <h1 className="atl-large-title">What are you looking for?</h1>
            <p className="atl-body atl-secondary">
              Describe the role in plain words: what a candidate must have, and what makes one stand out. The model
              scores every résumé against this.
            </p>
          </div>

          <div className="chips" role="group" aria-label="Start from a template">
            <span className="atl-footnote atl-secondary" style={{ alignSelf: 'center' }}>
              Start from:
            </span>
            {TEMPLATES.map((template) => (
              <Chip key={template.name} pressed={trimmed === template.text} onClick={() => setText(template.text)}>
                {template.name}
              </Chip>
            ))}
          </div>

          <TextArea
            label="What are you looking for?"
            hideLabel
            value={text}
            onChange={setText}
            rows={9}
            maxLength={8000}
            counter
            autoFocus
            placeholder="For example: Software engineering interns. Must have solid Python or Java and two real projects. Strong plus: internships and hackathon wins."
            hint={
              trimmed.length > 0 && trimmed.length < SHORT
                ? 'A little more detail helps: what must a candidate have, and what is a strong plus?'
                : undefined
            }
          />

          <div className="status-lines">
            <div className="status-line">
              <EyeOff className="atl-tertiary" aria-hidden size={18} strokeWidth={1.75} />
              <span className="atl-callout atl-secondary">
                Names, emails, phone numbers, RA numbers and sections are hidden from the model. It sees what the
                student did, not who they are.
              </span>
            </div>
            <div className="status-line">
              <Lock className="atl-tertiary" aria-hidden size={18} strokeWidth={1.75} />
              <span className="atl-callout atl-secondary">Criteria are locked once screening starts.</span>
            </div>
          </div>
          {save.isError && <Banner tone="error" title={messageOf(save.error)} />}
        </main>
      </div>
      <SetupBar
        hint={trimmed ? undefined : 'Describe what you are looking for to continue.'}
        primary={
          <Button variant="primary" disabled={!trimmed} loading={save.isPending} onClick={() => save.mutate()}>
            Continue
          </Button>
        }
      />
    </>
  )
}
