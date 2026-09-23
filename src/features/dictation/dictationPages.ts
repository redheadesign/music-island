export type DictationPage = 'general' | 'models' | 'history' | 'dictionary' | 'processing' | 'advanced'
export const dictationPages: Record<DictationPage, [string, string]> = {
  general: ['Основное', 'General'], models: ['Модели', 'Models'], history: ['История', 'History'],
  dictionary: ['Словарь', 'Dictionary'], processing: ['Обработка с ИИ', 'AI processing'], advanced: ['Дополнительно', 'Advanced'],
}

