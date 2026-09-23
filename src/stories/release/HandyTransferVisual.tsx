import { ArrowDown, Check, FileAudio } from 'lucide-react'
import { ModelCard } from '../../features/dictation/ModelCard'
import { AppLogo } from '../../shared/ui/AppLogo'
import { noop, releaseModel } from './release3Fixtures'

/** Presentation diagram of a copy, not a second implementation of the import dialog. */
export function HandyTransferVisual({ locale, time }: { locale: 'ru' | 'en'; time: number }) {
  const ru = locale === 'ru', model = releaseModel(locale)
  const progress = Math.max(0, Math.min(1, (time - .8) / 1.45))
  const travel = 1 - (1 - progress) ** 3
  const done = progress === 1
  return <div className="handy-transfer auxiliary-ui">
    <div className="handy-transfer__source"><span className="handy-transfer__app">Handy</span><div><FileAudio size={30} /><span>{model.name}<small>{ru ? 'Файл уже на компьютере' : 'Already on your computer'}</small></span><Check size={24} /></div></div>
    <div className="handy-transfer__route"><ArrowDown size={32} /><span>{done ? ru ? 'Скопировано' : 'Copied' : ru ? 'Копируем выбранный файл' : 'Copying your selected file'}</span><div className="handy-transfer__packet" style={{ transform: `translateY(${travel * 112}px) scale(${1 - travel * .15})`, opacity: Math.sin(progress * Math.PI) }}><FileAudio size={26} /></div></div>
    <div className="handy-transfer__destination"><span className="handy-transfer__app"><AppLogo size={30} />Music Island</span><div className="handy-transfer__reveal" style={{ clipPath: `inset(0 ${100 - travel * 100}% 0 0)` }}><ModelCard model={{ ...model, is_downloaded: true }} locale={locale} selected downloading={false} onDownload={noop} onSelect={noop} onCancel={noop} onDelete={noop} onDetails={noop} /></div></div>
    <p>{ru ? 'Без повторного скачивания · Файлы Handy остаются на месте' : 'No new download · Your Handy files stay in place'}</p>
  </div>
}
