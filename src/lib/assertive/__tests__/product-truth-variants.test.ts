import { describe, expect, it } from 'vitest'
import { enrichFromCatalog, type ProductTruth } from '../truth'

function thermo(): ProductTruth {
  return {
    name: 'Garrafa Soprano Cristal 1L preta',
    fields: Object.fromEntries(Object.entries({brand:'Soprano',model:'Cristal',color:'preta',capacity:'1 litro'}).map(([key,value])=>[key,{value,confidence:'confirmed' as const,source:'description' as const,evidence:'Vendedor',status:'CONFIRMED' as const}])),
    uncertain:[],evidence:[],confidence:1,
  }
}

describe('catalog enrichment respects the exact physical variant',()=>{
  it('does not invent conflicts for color grammar or equivalent capacity',()=>{
    const result=enrichFromCatalog(thermo(),{BRAND:'Soprano',MODEL:'Cristal',COLOR:'Preto',CAPACITY:'1 L'},'Garrafa Soprano Cristal 1L preta')
    expect(result.fields.color.status).toBe('CONFIRMED')
    expect(result.fields.capacity.status).toBe('CONFIRMED')
  })
  it('cannot import dimensions from the 500mL catalog version',()=>{
    const result=enrichFromCatalog(thermo(),{BRAND:'Soprano',MODEL:'Cristal',THERMO_CAPACITY:'500 mL',HEIGHT:'20 cm'},'Garrafa Soprano Cristal 500ml')
    expect(result.fields.height).toBeUndefined()
    expect(result.evidence).toEqual([])
    expect(result.fields.capacity.value).toBe('1 litro')
  })
  it('cannot import dimensions from a different named lid model',()=>{
    const result=enrichFromCatalog(thermo(),{BRAND:'Soprano',MODEL:'Cristal com bico',THERMO_CAPACITY:'1 L',HEIGHT:'29 cm'},'Garrafa Cristal com bico 1L')
    expect(result.fields.height).toBeUndefined()
    expect(result.evidence).toEqual([])
  })
})
