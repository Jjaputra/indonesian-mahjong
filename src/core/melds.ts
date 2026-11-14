import type { Meld } from './types';

/** House rule: claiming the fourth tile of a concealed triplet does not open the set. */
export function isConcealedSet(meld: { readonly type: Meld['type'] | 'kim_thi'; readonly fromConcealedTriplet?: true }): boolean {
  return meld.type === 'ankong' || (meld.type === 'kong' && meld.fromConcealedTriplet === true);
}
