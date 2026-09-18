import {describe,it,expect} from 'vitest'
import {evaluateMatch} from '../matching'
import type {ProductTruth} from '../truth'
const truth={name:'Garrafa Soprano Cristal',fields:{brand:{value:'Soprano',confidence:'confirmed'},model:{value:'Cristal',confidence:'confirmed'},color:{value:'preta',confidence:'confirmed'},capacity:{value:'1 litro',confidence:'confirmed'}}} as unknown as ProductTruth
describe('verified variant identity',()=>{
 it('rejects the real 500 mL catalog attribute for the seller 1 litre product',()=>{
  const result=evaluateMatch(truth,{title:'Garrafa Soprano Cristal 500ml',attributes:{BRAND:'Soprano',MODEL:'Cristal',COLOR:'Preto',THERMO_CAPACITY:'500 mL'}})
  expect(result.match_class).not.toBe('EXACT_PRODUCT')
  expect(result.usable_as_fact_source).toBe(false)
  expect(result.reasons).toContain('Capacidade divergente')
 })
 it('accepts the official category-specific 1 L capacity',()=>{
  expect(evaluateMatch(truth,{attributes:{BRAND:'Soprano',MODEL:'Cristal',THERMO_CAPACITY:'1000 mL'}}).match_class).toBe('EXACT_PRODUCT')
 })
 it('does not hide conflicting official capacity aliases behind the first value',()=>{
  expect(evaluateMatch(truth,{attributes:{BRAND:'Soprano',MODEL:'Cristal',CAPACITY:'1 L',THERMO_CAPACITY:'500 mL'}}).match_class).not.toBe('EXACT_PRODUCT')
 })
 it('does not equate a named model to a different lid variation by prefix',()=>{
  expect(evaluateMatch(truth,{attributes:{BRAND:'Soprano',MODEL:'Cristal com bico',THERMO_CAPACITY:'1 L'}}).match_class).not.toBe('EXACT_PRODUCT')
 })
 it('still tolerates model separators',()=>{
  const codeTruth={...truth,fields:{brand:truth.fields.brand,model:{...truth.fields.model,value:'KA-250'}}}
  expect(evaluateMatch(codeTruth,{attributes:{BRAND:'Soprano',MODEL:'KA250'}}).match_class).toBe('EXACT_PRODUCT')
 })
 it('accepts equivalent color grammar and volume units',()=>{
 expect(evaluateMatch(truth,{attributes:{BRAND:'Soprano',MODEL:'Cristal',COLOR:'Preto',CAPACITY:'1000 ml'}}).match_class).toBe('EXACT_PRODUCT')
 })
 it('rejects different capacity or color',()=>{
 for(const attributes of [{BRAND:'Soprano',MODEL:'Cristal',COLOR:'Branco',CAPACITY:'1 L'},{BRAND:'Soprano',MODEL:'Cristal',COLOR:'Preto',CAPACITY:'2 L'}])expect(evaluateMatch(truth,{attributes}).match_class).not.toBe('EXACT_PRODUCT')
 })
})
