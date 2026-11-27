import type { ModelInfo } from '../../shared/lib/dictationTypes'
import { gigaamCompactId, gigaamStreamingId } from './modelCatalog'

interface RatingBarProps {
  label: string
  value: number | null
  display: string
  valueText?: string
}

function RatingBar({ label, value, display, valueText }: RatingBarProps) {
  return <div className="dictation-model__rating">
    <span>{label}</span>
    <span className="dictation-model__rating-value" aria-hidden={value !== null || undefined}>{display}</span>
    {value === null
      ? <span aria-hidden="true" className="dictation-model__rating-track dictation-model__rating-track--unrated" />
      : <span className="dictation-model__rating-track" role="meter" aria-label={label}
          aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={valueText ?? display}>
          <span className="dictation-model__rating-fill" style={{ width: `${value}%` }} />
        </span>}
  </div>
}

export function ModelRatings({ model, locale }: { model: ModelInfo; locale: 'ru' | 'en' }) {
  const ru = locale === 'ru'
  const speedLabel = ru ? 'Скорость' : 'Speed'
  const accuracyLabel = ru ? 'Точность' : 'Accuracy'
  if (model.id === gigaamCompactId || model.id === gigaamStreamingId) {
    // Both variants ship this exact offline INT8 RNN-T graph; live results use a different graph.
    // https://huggingface.co/ai-babai/gigaam-v4-onnx/blob/7cfd40087b6180a83d9ef7fb991bd6813c48952f/README.md
    const speed = 70.9
    const russianWer = 2.53
    const englishWer = 6.56
    const wordErrors = [{ language: 'RU', wer: russianWer }, { language: 'EN', wer: englishWer }]
    return <div className="dictation-model__benchmarks">
      <details>
        <summary>{ru ? 'Тест после записи · INT8' : 'Offline benchmark · INT8'}</summary>
        <p>{ru
          ? `ai-babai измерил скорость на 8 записях после прогрева Apple M4 Pro в 3 потока. Шкала показывает скорость от 0 до 100× реального времени. На 16 записях FLEURS для каждого языка доля ошибок в словах (WER) составила ${russianWer.toLocaleString(locale)}% для русского и ${englishWer.toLocaleString(locale)}% для английского. Точность слов равна 100% минус WER.`
          : `ai-babai measured speed on 8 clips after warmup on an Apple M4 Pro using 3 CPU threads. The speed scale runs from 0 to 100× real time. On 16 FLEURS clips per language, the word error rate (WER) was ${russianWer}% for Russian and ${englishWer}% for English. Word accuracy is 100% minus WER.`}</p>
      </details>
      <div className="dictation-model__ratings">
        <RatingBar label={speedLabel} value={speed} display={`${speed.toLocaleString(locale)}×`}
          valueText={ru ? 'В 70,9 раза быстрее реального времени' : '70.9 times real time'} />
        {wordErrors.map(({ language, wer }) => {
          const accuracy = Number((100 - wer).toFixed(2))
          return <RatingBar key={language} label={`${accuracyLabel} · ${language}`} value={accuracy}
            display={`${accuracy.toLocaleString(locale)}%`} />
        })}
      </div>
    </div>
  }

  const ratings = [
    { label: speedLabel, value: model.speed_score },
    { label: accuracyLabel, value: model.accuracy_score },
  ]
  return <div className="dictation-model__ratings">
    {ratings.map(({ label, value }) => {
      // The native Handy catalog normalizes to 0–1 and uses zero for missing ratings.
      const score = value > 0 && value <= 1 ? Math.round(value * 100) : null
      return <RatingBar key={label} label={label} value={score}
        display={score === null ? (ru ? 'Нет оценки' : 'Not rated') : `${score}/100`}
        valueText={ru ? `${score} из 100` : `${score} out of 100`} />
    })}
  </div>
}
