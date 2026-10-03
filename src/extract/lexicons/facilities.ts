// Source: hand-compiled by the builder: the kinds of place a health worker in India refers a patient to.
// Names of kinds of facility only, not a list of real facilities.
import { buildMatcher } from '../lexicon';

export interface Facility {
  label: string;
  aliases: string[];
}

export const FACILITIES: Facility[] = [
  { label: 'district hospital', aliases: ['district hospital', 'district level hospital'] },
  { label: 'sub-district hospital', aliases: ['sub district hospital', 'sub-district hospital', 'subdistrict hospital'] },
  { label: 'community health centre', aliases: ['community health centre', 'community health center', 'chc'] },
  { label: 'primary health centre', aliases: ['primary health centre', 'primary health center', 'phc'] },
  { label: 'sub-centre', aliases: ['sub centre', 'sub-centre', 'sub center', 'subcentre', 'health sub centre'] },
  { label: 'eye hospital', aliases: ['eye hospital', 'eye centre', 'eye center'] },
  { label: 'medical college', aliases: ['medical college', 'medical college hospital'] },
  { label: 'civil hospital', aliases: ['civil hospital'] },
  { label: 'government hospital', aliases: ['government hospital', 'govt hospital'] },
  { label: 'maternity hospital', aliases: ['maternity hospital', 'maternity home'] },
  { label: 'dental clinic', aliases: ['dental clinic', 'dental hospital'] },
  { label: 'hospital', aliases: ['hospital'] },
];

export const findFacilities = buildMatcher(FACILITIES, (f) => f.aliases);
