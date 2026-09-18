function normalized(value: string): string {
  return value.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')
}

export function comparableVariant(key: string, value: string): string {
  if (key === 'color') {
    // Only grammatical equivalents; do not collapse finishes or colour combinations.
    const color = normalized(value)
    const equivalents: Record<string, string> = {
      preta: 'preto', branca: 'branco', vermelha: 'vermelho',
      amarela: 'amarelo', dourada: 'dourado', prateada: 'prateado', roxa: 'roxo',
    }
    return equivalents[color] || color
  }
  if (key === 'capacity') {
    const volume = value.trim().match(/^(\d+(?:[.,]\d+)?)\s*(ml|mililitros?|l|litros?)$/i)
    if (volume) {
      const amount = Number(volume[1].replace(',', '.'))
      const millilitres = amount * (/^m/i.test(volume[2]) ? 1 : 1000)
      if (Number.isFinite(millilitres) && millilitres > 0) return `volume-ml:${millilitres}`
    }
  }
  return normalized(value)
}
