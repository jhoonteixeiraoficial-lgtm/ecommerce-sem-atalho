import {describe,it,expect} from 'vitest'
import {selectRankedOffer} from '../ranked-offer'
const entry={position:5,organic_position:1,sponsored:false,item_id:'MLB777',catalog_product_id:'MLB123',url:'https://www.mercadolivre.com.br/p/MLB123?pdp_filters=item_id%3AMLB777',title:'Caneta',bestseller_badge:false,sold_quantity:null}
const snapshot={available:true,query:'Caneta',observed_at:'2026-09-17T16:00:00Z',search_url:'https://lista.mercadolivre.com.br/Caneta',entries:[entry]}
const offers=[{item_id:'MLB666',seller_id:666,price:10},{item_id:'MLB777',seller_id:777,price:30}]
describe('selectRankedOffer',()=>{
 it('selects the observed listing rather than cheapest and preserves both objects',()=>{
  const result=selectRankedOffer('MLB123',offers,snapshot)
  expect(result?.offer).toBe(offers[1]);expect(result?.entry).toBe(entry)
 })
 it('does not borrow another offer or catalog and excludes ads or unavailable search',()=>{
  expect(selectRankedOffer('MLB999',offers,snapshot)).toBeNull()
  expect(selectRankedOffer('MLB123',[offers[0]],snapshot)).toBeNull()
  expect(selectRankedOffer('MLB123',offers,{...snapshot,available:false})).toBeNull()
  expect(selectRankedOffer('MLB123',offers,{...snapshot,entries:[{...entry,sponsored:true}]})).toBeNull()
 })
 it('uses lowest observed position regardless of input ordering without mutating arrays',()=>{
  const later={...entry,position:10,organic_position:6,item_id:'MLB666'}
  const entries=[later,entry]
  expect(selectRankedOffer('MLB123',offers,{...snapshot,entries})?.offer.item_id).toBe('MLB777')
  expect(entries).toEqual([later,entry]);expect(offers[0].item_id).toBe('MLB666')
 })
})
