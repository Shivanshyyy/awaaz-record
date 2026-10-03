// Source: hand-compiled by the builder from common primary-care usage (generic names). The selection was guided
// by the WHO Model List of Essential Medicines and India's National List of Essential Medicines but is NOT copied
// from, or checked line by line against, either list. Names only: no doses, no uses, no advice.
// A few Indian brand names map to a generic only where they mean one single generic.
import type { DoseUnit } from '../../record/schema';
import { buildMatcher } from '../lexicon';

export interface Drug {
  /** canonical generic name, lowercase */
  name: string;
  aliases: string[];
  /** unit assumed when a dose is spoken without one (the worker is asked to check it) */
  defaultUnit?: DoseUnit;
}

const mg = (name: string, aliases: string[] = []): Drug => ({ name, aliases: [name, ...aliases], defaultUnit: 'mg' });
const other = (name: string, aliases: string[] = [], defaultUnit?: DoseUnit): Drug => ({ name, aliases: [name, ...aliases], defaultUnit });

export const DRUGS: Drug[] = [
  // pain and fever
  mg('paracetamol', ['acetaminophen', 'dolo', 'crocin', 'calpol', 'pcm']),
  mg('ibuprofen', ['brufen']),
  mg('diclofenac'),
  mg('aspirin'),
  mg('naproxen'),
  mg('mefenamic acid'),
  // antibiotics and anti-infectives
  mg('amoxicillin', ['amoxycillin', 'amoxicilin', 'amoxil']),
  mg('amoxicillin clavulanate', ['co-amoxiclav', 'amoxiclav']),
  mg('azithromycin'),
  mg('ciprofloxacin', ['cipro']),
  mg('doxycycline'),
  mg('cefixime'),
  mg('cefalexin', ['cephalexin']),
  mg('cotrimoxazole', ['co-trimoxazole', 'cotrimoxazol']),
  mg('metronidazole', ['metrogyl']),
  mg('nitrofurantoin'),
  mg('norfloxacin'),
  mg('ofloxacin'),
  mg('levofloxacin'),
  mg('erythromycin'),
  mg('penicillin'),
  mg('cefuroxime'),
  mg('clindamycin'),
  other('gentamicin', [], 'mg'),
  other('ceftriaxone', [], 'g'),
  // worms, malaria, skin infestations
  mg('albendazole'),
  mg('mebendazole'),
  mg('ivermectin'),
  mg('chloroquine'),
  mg('primaquine'),
  mg('artemether lumefantrine', ['coartem']),
  mg('fluconazole'),
  mg('clotrimazole'),
  mg('ketoconazole'),
  other('permethrin'),
  other('benzyl benzoate'),
  other('calamine', ['calamine lotion']),
  other('mupirocin'),
  // stomach and gut
  other('ors', ['o r s', 'oral rehydration salts', 'oral rehydration solution', 'oral rehydration salt']),
  mg('zinc', ['zinc sulphate', 'zinc sulfate']),
  mg('omeprazole'),
  mg('pantoprazole'),
  mg('ranitidine'),
  mg('domperidone'),
  mg('ondansetron'),
  mg('loperamide'),
  mg('bisacodyl'),
  other('lactulose', [], 'ml'),
  other('antacid', ['antacid syrup'], 'ml'),
  // breathing, allergy, cough
  mg('cetirizine', ['cetrizine', 'cetirizin']),
  mg('chlorpheniramine', ['avil']),
  mg('loratadine'),
  mg('montelukast'),
  mg('salbutamol', ['albuterol']),
  mg('prednisolone'),
  mg('dexamethasone'),
  mg('hydrocortisone'),
  other('beclomethasone'),
  other('budesonide'),
  mg('ambroxol'),
  mg('bromhexine'),
  mg('dextromethorphan'),
  // heart, blood pressure, sugar
  mg('amlodipine'),
  mg('atenolol'),
  mg('metoprolol'),
  mg('enalapril'),
  mg('losartan'),
  mg('telmisartan'),
  mg('hydrochlorothiazide'),
  mg('furosemide'),
  mg('spironolactone'),
  mg('metformin'),
  mg('glimepiride'),
  mg('glibenclamide'),
  mg('gliclazide'),
  other('insulin', [], 'units'),
  mg('atorvastatin'),
  mg('simvastatin'),
  mg('clopidogrel'),
  mg('isosorbide'),
  mg('digoxin'),
  // vitamins, minerals, thyroid
  mg('folic acid'),
  mg('ferrous sulphate', ['ferrous sulfate', 'iron tablet', 'ifa']),
  mg('calcium'),
  mg('vitamin d', ['cholecalciferol']),
  mg('vitamin a'),
  mg('vitamin b12', ['cyanocobalamin']),
  mg('vitamin c', ['ascorbic acid']),
  other('multivitamin', ['multi vitamin']),
  mg('levothyroxine'),
];

export const findDrugs = buildMatcher(DRUGS, (d) => d.aliases);

export function drugByName(name: string): Drug | undefined {
  return DRUGS.find((d) => d.name === name);
}
