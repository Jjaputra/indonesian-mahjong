import type { Meld } from './types';

/** Ankong and a discard Kong onto a concealed triplet count toward Sam/Si Am Kang. */
export function isConcealedTripletForAmKang(meld: { readonly type: Meld['type'] | 'kim_thi'; readonly fromConcealedTriplet?: true }): boolean {
  return meld.type === 'ankong' || (meld.type === 'kong' && meld.fromConcealedTriplet === true);
}

/** Only Ankong keeps a declared set concealed for Mun / Ce Mo Pu Ciu Jen. */
export function keepsHandConcealed(meld: { readonly type: Meld['type'] | 'kim_thi' }): boolean {
  return meld.type === 'ankong';
}
