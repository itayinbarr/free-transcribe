/** Language, model tier and the speaker-labelling toggle. */

import { availableTiers, getAsrModel } from '../lib/models.ts'
import type { Language, Tier } from '../lib/types.ts'

interface Props {
  language: Language
  tier: Tier
  diarize: boolean
  locked: boolean
  onLanguage: (language: Language) => void
  onTier: (tier: Tier) => void
  onDiarize: (diarize: boolean) => void
}

const LANGUAGES: { value: Language; label: string; native: string }[] = [
  { value: 'he', label: 'Hebrew', native: 'עברית' },
  { value: 'en', label: 'English', native: 'English' },
]

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-baseline gap-2">
        <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          {label}
        </span>
        {hint && <span className="truncate text-xs text-slate-400 dark:text-slate-500">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function SegmentedButton({
  active,
  onClick,
  disabled,
  children,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={active}
      className={[
        'min-h-11 flex-1 rounded-xl px-3 py-2 text-sm font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-white'
          : 'text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

export function Controls({ language, tier, diarize, locked, onLanguage, onTier, onDiarize }: Props) {
  const tiers = availableTiers(language)
  const model = getAsrModel(language, tier)

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Field label="Audio language">
        <div className="flex gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
          {LANGUAGES.map((option) => (
            <SegmentedButton
              key={option.value}
              active={language === option.value}
              disabled={locked}
              onClick={() => onLanguage(option.value)}
            >
              {option.native}
            </SegmentedButton>
          ))}
        </div>
      </Field>

      <Field label="Model" hint={`${model.sizeMB} MB · ${model.license}`}>
        {tiers.length > 1 ? (
          <div className="flex gap-1 rounded-2xl bg-slate-100 p-1 dark:bg-slate-800">
            {tiers.map((value) => (
              <SegmentedButton
                key={value}
                active={tier === value}
                disabled={locked}
                onClick={() => onTier(value)}
              >
                {getAsrModel(language, value).label}
              </SegmentedButton>
            ))}
          </div>
        ) : (
          <div className="flex min-h-[3.25rem] items-center rounded-2xl bg-slate-100 px-4 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-200">
            {model.label}
          </div>
        )}
      </Field>

      <div className="sm:col-span-2">
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-2xl border border-slate-200 p-3 transition hover:border-slate-300 sm:items-center dark:border-slate-700 dark:hover:border-slate-600">
          <input
            type="checkbox"
            checked={diarize}
            disabled={locked}
            onChange={(event) => onDiarize(event.target.checked)}
            className="mt-0.5 size-5 shrink-0 rounded accent-indigo-600 sm:mt-0"
          />
          <span className="min-w-0">
            <span className="block text-sm font-medium text-slate-900 dark:text-slate-100">
              Mark who is speaking
            </span>
            <span className="block text-xs text-slate-500 dark:text-slate-400">
              Splits the transcript by speaker. Adds a 16 MB download and some processing time.
            </span>
          </span>
        </label>
      </div>

      {model.notes && (
        <p className="text-xs text-slate-500 sm:col-span-2 dark:text-slate-400">{model.notes}</p>
      )}
    </div>
  )
}
