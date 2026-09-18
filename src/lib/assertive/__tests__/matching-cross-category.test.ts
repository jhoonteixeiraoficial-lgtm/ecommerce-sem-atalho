import { describe, expect, it } from 'vitest'
import { evaluateMatch } from '../matching'
import type { ProductTruth } from '../truth'

interface Case { name:string; brand:string; model:string; fieldKey:string; fieldValue:string; accepted:Record<string,string>; rejected:Record<string,string> }

const cases:Case[] = [
  { name:'Parafusadeira 20V azul', brand:'Ferramenta A', model:'F20', fieldKey:'voltage', fieldValue:'20 V', accepted:{VOLTAGE:'20V',BRAND:'Ferramenta A',MODEL:'F20'}, rejected:{VOLTAGE:'12V',BRAND:'Ferramenta A',MODEL:'F20'} },
  { name:'Perfume 100ml', brand:'Perfume B', model:'Essência', fieldKey:'capacity', fieldValue:'100 ml', accepted:{CAPACITY:'0,1 litro',BRAND:'Perfume B',MODEL:'Essência'}, rejected:{CAPACITY:'50 mL',BRAND:'Perfume B',MODEL:'Essência'} },
  { name:'Kit de 12 canetas', brand:'Caneta C', model:'Escrita', fieldKey:'units_per_pack', fieldValue:'12', accepted:{UNITS_PER_PACK:'12',BRAND:'Caneta C',MODEL:'Escrita'}, rejected:{UNITS_PER_PACK:'6',BRAND:'Caneta C',MODEL:'Escrita'} },
  { name:'Mochila preta', brand:'Mochila D', model:'Urbana', fieldKey:'color', fieldValue:'preta', accepted:{COLOR:'Preto',BRAND:'Mochila D',MODEL:'Urbana'}, rejected:{COLOR:'Branco',BRAND:'Mochila D',MODEL:'Urbana'} },
]

function buildTruth(c:Case):ProductTruth {
  return {
    name:c.name,
    fields:{
      brand:{value:c.brand,confidence:'confirmed',source:'user',evidence:'Dados do vendedor'},
      model:{value:c.model,confidence:'confirmed',source:'user',evidence:'Dados do vendedor'},
      [c.fieldKey]:{value:c.fieldValue,confidence:'confirmed',source:'user',evidence:'Dados do vendedor'},
    },
    uncertain:[],evidence:[],confidence:1,
  }
}

describe('shared identity rules across product categories',()=>{
  it.each(cases)('$name accepts equivalent facts and rejects a different variant',(c)=>{
    const truth=buildTruth(c)
    const accepted=evaluateMatch(truth,{title:c.name,attributes:c.accepted})
    expect(accepted.match_class).toBe('EXACT_PRODUCT')
    expect(accepted.usable_as_fact_source).toBe(true)
    const rejected=evaluateMatch(truth,{title:c.name,attributes:c.rejected})
    expect(rejected.match_class).not.toBe('EXACT_PRODUCT')
    expect(rejected.usable_as_fact_source).toBe(false)
  })
})
