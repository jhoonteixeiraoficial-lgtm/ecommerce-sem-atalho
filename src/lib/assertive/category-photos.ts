/**
 * Requisitos visuais de fotos por categoria ML.
 *
 * Cada categoria define:
 *  - background: fundo obrigatório
 *  - shot_types: tipos de foto necessários
 *  - min_photos: mínimo de fotos
 *  - format: formato preferido
 *  - restrictions: o que NÃO pode ter
 */

export type BackgroundType = 'white_pure' | 'white_neutral' | 'neutral' | 'contextual' | 'any'

export interface PhotoShotType {
  id: string
  label: string
  description: string
  required: boolean
}

export interface CategoryPhotoRequirements {
  background: BackgroundType
  min_photos: number
  recommended_photos: number
  format: { width: number; height: number; ratio: string }
  shot_types: PhotoShotType[]
  restrictions: string[]
  tips: string[]
}

// Requisitos por DOMÍNIO do ML (domain_id)
// Domínios mais específicos herdam do genérico quando não definidos
const DOMAIN_REQUIREMENTS: Record<string, Partial<CategoryPhotoRequirements>> = {
  // === TECNOLOGIA / ELETRÔNICOS ===
  MLB_TELEPHONY: {
    background: 'white_pure',
    min_photos: 4,
    recommended_photos: 6,
    format: { width: 1200, height: 1200, ratio: '1:1' },
    shot_types: [
      { id: 'front', label: 'Frontal', description: 'Produto centralizado, fundo branco', required: true },
      { id: 'back', label: 'Traseira', description: 'Verso do produto mostrando ports/câmera', required: true },
      { id: 'detail', label: 'Detalhe', description: 'Close em feature importante (tela, botões)', required: true },
      { id: 'accessories', label: 'Acessórios', description: 'Conteúdo da embalagem', required: false },
    ],
    restrictions: ['Sem texto/sobreposição', 'Sem watermark', 'Sem badges ML', 'Produto exato'],
    tips: ['Fundo branco digital puro (255,255,255)', 'Produto ocupa 85-95% do frame', 'Ativar zoom (1200px+)'],
  },
  MLB_COMPUTER: {
    background: 'white_pure',
    min_photos: 4,
    recommended_photos: 6,
    format: { width: 1200, height: 1200, ratio: '1:1' },
    shot_types: [
      { id: 'front', label: 'Frontal', description: 'Produto centralizado, fundo branco', required: true },
      { id: 'side', label: 'Lateral', description: 'Mostrar espessura e portas', required: true },
      { id: 'detail', label: 'Detalhe', description: 'Teclado, tela, portas', required: true },
      { id: 'accessories', label: 'Acessórios', description: 'Carregador, cabo, embalagem', required: false },
    ],
    restrictions: ['Sem texto/sobreposição', 'Sem watermark', 'Produto exato'],
    tips: ['Fundo branco digital puro', 'Mostrar todas as faces'],
  },
  MLB_ELECTRONICS: {
    background: 'white_pure',
    min_photos: 4,
    recommended_photos: 6,
    format: { width: 1200, height: 1200, ratio: '1:1' },
    shot_types: [
      { id: 'front', label: 'Frontal', description: 'Produto centralizado', required: true },
      { id: 'detail', label: 'Detalhe', description: 'Features principais', required: true },
      { id: 'accessories', label: 'Acessórios', description: 'Conteúdo da embalagem', required: false },
    ],
    restrictions: ['Fundo branco obrigatório', 'Sem texto', 'Produto exato'],
    tips: ['Fundo branco digital puro', 'Mostrar插口/接入点'],
  },

  // === FERRAMENTAS / CONSTRUÇÃO ===
  MLB_TOOLS: {
    background: 'neutral',
    min_photos: 4,
    recommended_photos: 8,
    format: { width: 1200, height: 1200, ratio: '1:1' },
    shot_types: [
      { id: 'front', label: 'Principal', description: 'Produto em uso ou posição natural', required: true },
      { id: 'detail', label: 'Detalhe técnico', description: 'Conexões, botões, visor, escala', required: true },
      { id: 'in_use', label: 'Em uso', description: 'Produto sendo utilizado pelo usuário', required: true },
      { id: 'packaging', label: 'Embalagem', description: 'Caixa, manual, acessórios inclusos', required: true },
      { id: 'accessories', label: 'Acessórios', description: 'Brocas, baterias, carregador', required: false },
      { id: 'scale', label: 'Escala', description: 'Produto junto a referência de tamanho', required: false },
    ],
    restrictions: ['Produto exato (mesma marca/modelo)', 'Sem�件 diferentes', 'Sem texto promocional'],
    tips: ['Mostrar produto EM USO aumenta confiança', 'Mostrar TODOS os acessórios inclusos', 'Fundo neutro ou contextual'],
  },

  // === MODA / VESTUÁRIO ===
  MLB_FASHION: {
    background: 'white_neutral',
    min_photos: 4,
    recommended_photos: 6,
    format: { width: 1200, height: 1540, ratio: '4:5' },
    shot_types: [
      { id: 'front', label: 'Frontal', description: 'Vestido em modelo ou manequim fantasma', required: true },
      { id: 'back', label: 'Verso', description: 'Costas mostrando caimento', required: true },
      { id: 'detail', label: 'Detalhe', description: 'Tecido, costura, estampa', required: true },
      { id: 'model', label: 'Em uso', description: 'Modelo vestindo a peça', required: false },
    ],
    restrictions: ['Sem poses sugestivas', 'Manequim fantasma para íntimas', 'Sem rebarbas/folgas'],
    tips: ['Formato vertical 4:5 preenche tela do celular', 'Passar/escovar peça antes de fotografar', 'Mostrar elasticidade se aplicável'],
  },

  // === CASA / MÓVEIS ===
  MLB_HOME: {
    background: 'contextual',
    min_photos: 4,
    recommended_photos: 6,
    format: { width: 1200, height: 1200, ratio: '1:1' },
    shot_types: [
      { id: 'front', label: 'Principal', description: 'Produto em ambiente decorado', required: true },
      { id: 'detail', label: 'Detalhe', description: 'Material, textura, acabamento', required: true },
      { id: 'context', label: 'Contexto', description: 'Produto em uso no ambiente', required: true },
      { id: 'dimensions', label: 'Dimensões', description: 'Medidas ou referência de escala', required: false },
    ],
    restrictions: ['Não mostrar outros produtos como se fossem inclusos', 'Medidas reais'],
    tips: ['Ambiente decorado aumenta conversão', 'Mostrar medida real com trena'],
  },

  // === ESPORTES / FITNESS ===
  MLB_SPORTS: {
    background: 'neutral',
    min_photos: 4,
    recommended_photos: 6,
    format: { width: 1200, height: 1200, ratio: '1:1' },
    shot_types: [
      { id: 'front', label: 'Principal', description: 'Produto centralizado', required: true },
      { id: 'in_use', label: 'Em uso', description: 'Pessoa utilizando o produto', required: true },
      { id: 'detail', label: 'Detalhe', description: 'Material, costuras, ajustes', required: true },
      { id: 'accessories', label: 'Acessórios', description: 'Conteúdo completo', required: false },
    ],
    restrictions: ['Produto exato', 'Sem componentes de outros produtos'],
    tips: ['Mostrar produto em uso aumenta confiança', 'Mostrar tamanho real'],
  },

  // === BELEZA / SAÚDE ===
  MLB_BEAUTY: {
    background: 'white_pure',
    min_photos: 4,
    recommended_photos: 6,
    format: { width: 1200, height: 1200, ratio: '1:1' },
    shot_types: [
      { id: 'front', label: 'Principal', description: 'Produto com embalagem visível', required: true },
      { id: 'texture', label: 'Textura', description: 'Close na textura/cor do produto', required: true },
      { id: 'ingredients', label: 'Composição', description: 'Rótulo com ingredientes', required: false },
      { id: 'in_use', label: 'Em uso', description: 'Produto sendo aplicado', required: false },
    ],
    restrictions: ['Fundo branco obrigatório', 'Sem antes/depois', 'Sem promessas de resultado'],
    tips: ['Mostrar número de registro ANVISA se aplicável', 'Fundo branco digital puro'],
  },

  // === AUTOMOTIVO ===
  MLB_AUTO: {
    background: 'neutral',
    min_photos: 4,
    recommended_photos: 6,
    format: { width: 1200, height: 1200, ratio: '1:1' },
    shot_types: [
      { id: 'front', label: 'Principal', description: 'Produto centralizado', required: true },
      { id: 'detail', label: 'Detalhe', description: 'Conexões, encaixes, especificações', required: true },
      { id: 'in_use', label: 'Instalado', description: 'Produto instalado no veículo', required: false },
      { id: 'compatibility', label: 'Compatibilidade', description: 'Veículos compatíveis', required: false },
    ],
    restrictions: ['Produto exato', 'Não mostrar veículos diferentes'],
    tips: ['Mostrar código da peça', 'Mostrar compatibilidade com veículo'],
  },

  // === ALIMENTOS ===
  MLB_GROCERY: {
    background: 'white_pure',
    min_photos: 4,
    recommended_photos: 6,
    format: { width: 1200, height: 1200, ratio: '1:1' },
    shot_types: [
      { id: 'front', label: 'Principal', description: 'Embalagem fechada, fundo branco', required: true },
      { id: 'nutrition', label: 'Informação nutricional', description: 'Tabela nutricional legível', required: true },
      { id: 'open', label: 'Aberto', description: 'Produto dentro da embalagem', required: false },
    ],
    restrictions: ['Fundo branco obrigatório', 'Validade visível', 'Sem alusão a benefícios terapêuticos'],
    tips: ['Mostrar selos obrigatórios', 'Validade deve estar visível'],
  },

  // === GENÉRICO (fallback) ===
  MLB_DEFAULT: {
    background: 'white_pure',
    min_photos: 4,
    recommended_photos: 6,
    format: { width: 1200, height: 1200, ratio: '1:1' },
    shot_types: [
      { id: 'front', label: 'Principal', description: 'Produto centralizado, fundo adequado', required: true },
      { id: 'detail', label: 'Detalhe', description: 'Feature importante do produto', required: true },
      { id: 'accessories', label: 'Conteúdo', description: 'O que vem na embalagem', required: false },
    ],
    restrictions: ['Produto exato', 'Sem texto promocional', 'Sem watermark'],
    tips: ['Fundo branco para tecnologia/beleza', 'Fundo neutro para ferramentas/moda'],
  },
}

/**
 * Mapeia domain_id do ML para o conjunto de requisitos.
 * Se o domínio específico não existe, usa o genérico.
 */
export function getPhotoRequirements(domainId: string | null): CategoryPhotoRequirements {
  if (!domainId) return DOMAIN_REQUIREMENTS.MLB_DEFAULT as CategoryPhotoRequirements

  // Tenta domínio específico, depois genérico do grupo
  const specific = DOMAIN_REQUIREMENTS[domainId]
  if (specific) return { ...(DOMAIN_REQUIREMENTS.MLB_DEFAULT as CategoryPhotoRequirements), ...specific }

  // Tenta grupo (ex: MLB_TOOLS de "MLB_TOOLS_AND_CONSTRUCTION")
  const groupKey = Object.keys(DOMAIN_REQUIREMENTS).find(
    k => domainId.startsWith(k) || k !== 'MLB_DEFAULT' && domainId.includes(k.replace('MLB_', ''))
  )
  if (groupKey && groupKey !== 'MLB_DEFAULT') {
    return { ...(DOMAIN_REQUIREMENTS.MLB_DEFAULT as CategoryPhotoRequirements), ...DOMAIN_REQUIREMENTS[groupKey] }
  }

  return DOMAIN_REQUIREMENTS.MLB_DEFAULT as CategoryPhotoRequirements
}

/**
 * Determina o fundo apropriado para a CAPA (foto principal).
 */
export function getRequiredCoverBackground(domainId: string | null): BackgroundType {
  const req = getPhotoRequirements(domainId)
  return req.background
}

/**
 * Retorna os tipos de foto que o ML espera para esta categoria.
 */
export function getRequiredShotTypes(domainId: string | null): PhotoShotType[] {
  const req = getPhotoRequirements(domainId)
  return req.shot_types
}
